import test from 'node:test';
import assert from 'node:assert/strict';
import { LevelManager } from '../src/campaign/LevelManager.js';
import { level01 } from '../src/campaign/levels/level01.js';
import { level02 } from '../src/campaign/levels/level02.js';
import { CampaignManager } from '../src/campaign/CampaignManager.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { BuildSystem } from '../src/building/BuildSystem.js';
import { World } from '../src/world/World.js';
import { Machine } from '../src/entities/Machine.js';
import { rateMission, starGoals, starCriteria, starString } from '../src/campaign/StarRating.js';
import { diagnoseMission } from '../src/campaign/MissionDiagnosis.js';
import { CoolingUnit } from '../src/entities/CoolingUnit.js';
import { CoolingPerformanceSolver } from '../src/simulation/cooling/CoolingPerformanceSolver.js';

class MemoryStorage {constructor(){this.data=new Map();}getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}

const setup=(level=level01)=>{
  const world=new LevelManager().load(level),sim=new Simulation(world,level,{planning:true});sim.initialize();
  return {world,sim,build:new BuildSystem(world,sim,{budget:level.budget,inventory:level.inventory}),level};
};

test('stars: complete, cost goal and comfortable operation are independent',()=>{
  const goals=starGoals(level01);
  assert.equal(starCriteria(level01).length,3);
  const good={cost:goals.cost,maxPower:goals.maxPower,thermalMargin:goals.margin};
  assert.equal(rateMission(level01,good,true).stars,3);
  assert.equal(rateMission(level01,{...good,cost:goals.cost+1},true).stars,2);
  assert.equal(rateMission(level01,{...good,thermalMargin:goals.margin-.1},true).stars,2);
  assert.equal(rateMission(level01,{...good,maxPower:goals.maxPower+1,cost:goals.cost+1},true).stars,1);
  assert.equal(rateMission(level01,good,false).stars,0,'no stars without completing');
  assert.equal(starString(2),'★★☆');
});

test('star goals fall back to the level power objective and budget',()=>{
  const goals=starGoals({...level02,stars:undefined});
  assert.equal(goals.maxPower,4800,'80% of the 6 kW objective');
  assert.equal(goals.cost,7200,'40% of the budget');
  assert.deepEqual(starGoals({...level02,stars:{cost:900,margin:4,maxPower:3000}}),{cost:900,margin:4,maxPower:3000});
});

test('the campaign keeps the best star count and totals it',()=>{
  const campaign=new CampaignManager({storage:new MemoryStorage()});
  campaign.completeLevel(level01,{cost:1,maxPower:1,stars:2});
  campaign.completeLevel(level01,{cost:1,maxPower:1,stars:1});
  assert.equal(campaign.stars(level01),2);
  assert.equal(campaign.totalStars(),2);
  campaign.state.completedLevels.push(level02.id);
  assert.equal(campaign.stars(level02),1,'levels completed before stars existed count as one star');
});

test('mission tracks the smallest thermal margin while running',()=>{
  const {sim}=setup();sim.startOperation();
  for(let i=0;i<20;i++)sim.update(.05);
  assert.ok(Number.isFinite(sim.mission.minThermalMargin));
  assert.ok(sim.mission.minThermalMargin<=15,'machines start at 25 °C for a 40 °C limit');
});

test('a failure records which machine failed and where',()=>{
  const world=new World(8,8),machine=world.addEntity(new Machine(3,4,{name:'Prensa',startAt:0,temperature:95}));
  const level={id:'fail',objectives:[{type:'machineTemperature',max:40}],failures:[{type:'machineOverheat',temperature:80,hold:0}],events:[],missionDuration:300,objectiveStartAt:0};
  const sim=new Simulation(world,level);sim.initialize();sim.update(.05);
  assert.equal(sim.mission.state,'failed');
  assert.equal(sim.mission.failure.entityId,machine.id);
  assert.equal(sim.mission.failure.entityName,'Prensa');
  assert.deepEqual([sim.mission.failure.x,sim.mission.failure.y],[3,4]);
});

test('undo removes a placement with a full refund and redo charges it again',()=>{
  const {build,world}=setup(),budget=build.budget,stock=build.inventory.fan;
  build.select('fan');assert.ok(build.place(20,30).ok);
  assert.equal(build.budget,budget-100);
  assert.equal(build.undo().ok,true);
  assert.equal(world.entitiesByType('fan').length,0);
  assert.equal(build.budget,budget);assert.equal(build.inventory.fan,stock);
  assert.equal(build.redo().ok,true);
  assert.equal(world.entitiesByType('fan').length,1);assert.equal(build.budget,budget-100);
  assert.equal(build.redo().ok,false,'nothing left to redo');
});

test('a dragged duct path is undone as one action',()=>{
  const {build,world,sim}=setup();
  build.select('coolingUnit');build.place(3,19);
  build.select('duct');build.placeDuctPath([4,5,6,7,8].map(x=>({x,y:19})));
  assert.equal(world.allUtilities().filter(item=>item.type==='duct').length,5);
  const result=build.undo();
  assert.equal(result.ok,true);assert.match(result.label,/5× Duto/);
  assert.equal(world.allUtilities().filter(item=>item.type==='duct').length,0);
  assert.equal(world.entitiesByType('coolingUnit').length,1,'only the last action is undone');
  assert.ok(Math.abs(sim.metrics.energyBalance)<1e-6,'construction energy stays accounted');
});

test('undoing a demolition restores the item and its cost; walls restore their material',()=>{
  const {build,world}=setup();
  build.select('wall');build.placeStructurePath([{x:20,y:30},{x:21,y:30}]);
  const afterWalls=build.budget;
  assert.equal(world.materialAt(20,30).id,'concrete');
  build.select('demolish');build.demolishArea({x:20,y:30},{x:21,y:30});
  assert.equal(world.isAir(20,30),true);
  build.undo();
  assert.equal(world.materialAt(20,30).id,'concrete');assert.equal(build.budget,afterWalls);
  build.undo();
  assert.equal(world.isAir(21,30),true);
  assert.equal(build.canUndo(),false);
});

test('undo refuses to restore over an occupied cell',()=>{
  const {build,world}=setup();
  build.select('fan');build.place(20,30);build.select('demolish');build.place(20,30);
  const blocker=world.addEntity(new Machine(20,30,{startAt:0}));
  const result=build.undo(),budget=build.budget;
  assert.equal(result.ok,false);assert.match(result.reason,/ocupada/);
  assert.equal(world.entitiesByType('fan').length,0);assert.equal(build.budget,budget);
  world.removeEntity(blocker);
  assert.equal(build.undo().ok,true,'works again once the cell is free');
  assert.equal(world.entitiesByType('fan').length,1);
});

test('a unit at full capacity is only overloaded when the zone it serves is above its limit',()=>{
  const unit=new CoolingUnit(0,0,{tier:'compact'}),network={status:'READY',paths:[{flowRate:1.2}]},solver=new CoolingPerformanceSolver();
  assert.equal(solver.solve(unit,network,25,false,30).status,'HIGH LOAD','working hard inside the limit');
  assert.equal(solver.solve(unit,network,34,false,30).status,'OVERLOAD','cannot hold the zone limit');
  assert.equal(solver.solve(unit,network,25).status,'OVERLOAD','without a service limit the capacity-only rule applies');
});

test('the service limit comes from the zone the vent blows into',()=>{
  const {sim,build}=setup();
  build.select('coolingUnit');build.place(3,19);build.select('duct');build.placeDuctPath([4,5,6].map(x=>({x,y:19})));
  build.select('supplyVent');build.rotation=0;assert.ok(build.place(7,19).ok,'vent outside the room');
  const vent=sim.world.entitiesByType('supplyVent')[0];
  assert.equal(sim.cooling.ventZone(vent).id,'machine-room','the jet reaches the room behind the wall');
  assert.equal(sim.cooling.serviceLimit([{vent}]),40);
  assert.equal(sim.cooling.serviceLimit([]),30,'default limit when no zone is served');
});

test('debrief diagnosis explains a power overrun and an indoor condenser',()=>{
  const {sim,build,level}=setup();
  build.coolingUnitModel='commercial';build.select('coolingUnit');build.place(30,30);
  sim.metrics.maxPowerEver=12900;
  const hints=diagnoseMission({sim,level});
  assert.equal(hints.length,2);
  assert.match(hints[0].title,/Consumo/);assert.match(hints[0].text,/Compacto/);
  assert.match(hints[1].title,/dentro da sala/);
});

test('debrief diagnosis notices when heat has nowhere to go',()=>{
  const {sim,build,level}=setup();
  build.select('fan');build.place(20,30);
  const hints=diagnoseMission({sim,level},{limit:5});
  assert.ok(hints.some(hint=>/para onde ir/.test(hint.title)));
});
