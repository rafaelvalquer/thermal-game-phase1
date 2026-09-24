import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/campaign/levels/index.js';
import { LevelManager } from '../src/campaign/LevelManager.js';
import { CampaignManager } from '../src/campaign/CampaignManager.js';
import { MissionEventSystem } from '../src/campaign/MissionEventSystem.js';
import { ObjectiveSystem } from '../src/campaign/ObjectiveSystem.js';
import { World } from '../src/world/World.js';
import { Machine } from '../src/entities/Machine.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { BuildSystem } from '../src/building/BuildSystem.js';
import { engineeringSandbox } from '../src/campaign/engineeringSandbox.js';

class MemoryStorage {
  constructor(){this.data=new Map();}
  getItem(k){return this.data.get(k)??null;}
  setItem(k,v){this.data.set(k,String(v));}
}

const metrics=()=>({powerDraw:0,maxAirTemp:25,maxTemp:25,avgTemp:25});

test('all six levels load from data definitions',()=>{
  const manager=new LevelManager();
  assert.equal(LEVELS.length,6);
  for(const level of LEVELS){
    const world=manager.load(level);
    assert.equal(world.width,level.map.width);
    assert.equal(world.height,level.map.height);
    assert.equal(world.levelId,level.id);
    assert.ok(world.entities.length>0);
    assert.equal(level.thermalSystems.simpleCooling,true);
    assert.equal(level.thermalSystems.waterCooling,true);
    for(const waterTool of ['pipe','pump','tank','radiator','exchanger'])assert.ok(level.inventory[waterTool]>0,`${level.name} should stock ${waterTool}`);
    for(const legacyTool of ['airHandler','returnVent','refrigerantLine','smallDuct','mediumDuct','largeDuct','damper'])assert.equal(level.inventory[legacyTool],undefined);
    assert.ok(level.inventory.coolingUnit>=1);
    assert.ok(level.inventory.duct>0);
    assert.ok(level.inventory.supplyVent>0);
  }
});

test('critical data center provides enough air ducts for independent cooling networks',()=>{
  const level=LEVELS.find(candidate=>candidate.number===6);
  assert.equal(level.inventory.duct,400);
  assert.equal(level.inventory.coolingUnit,4);
});

test('level six lays out aligned server racks for hot and cold aisle containment',()=>{
  const level=LEVELS.find(candidate=>candidate.number===6);
  const racks=level.entities.filter(entity=>entity.type==='serverRack');
  assert.equal(level.name,'Data Center Crítico');
  assert.equal(racks.length,12);

  for(const hall of ['a','b']){
    const roomRacks=racks.filter(rack=>rack.zoneId===`server-${hall}`);
    const north=roomRacks.filter(rack=>rack.y===12);
    const south=roomRacks.filter(rack=>rack.y===18);
    assert.deepEqual(north.map(rack=>rack.x).sort((a,b)=>a-b),south.map(rack=>rack.x).sort((a,b)=>a-b));
    assert.ok(north.every(rack=>rack.airIntakeDirection.y===-1&&rack.airExhaustDirection.y===1));
    assert.ok(south.every(rack=>rack.airIntakeDirection.y===1&&rack.airExhaustDirection.y===-1));

    const loads=roomRacks.reduce((sum,rack)=>sum+rack.heatOutput,0);
    assert.deepEqual(north.map(rack=>rack.x).sort((a,b)=>a-b),hall==='a'?[10,18,26]:[38,46,54]);
    assert.equal(loads,hall==='a'?15000:16000);
    for(const aisle of ['cold-north','hot','cold-south']){
      const zoneId=`server-${hall}-${aisle}`;
      assert.ok(level.zones.some(zone=>zone.id===zoneId),`missing ${zoneId}`);
      assert.ok(level.objectives.some(objective=>objective.type==='zoneTemperature'&&objective.zoneId===zoneId));
    }
  }
  assert.equal(level.events.find(event=>event.time===180).filter.zoneId,'server-b');
});

test('campaign completion unlocks the next level and persists',()=>{
  const storage=new MemoryStorage(),campaign=new CampaignManager({storage});
  assert.equal(campaign.isUnlocked(LEVELS[0]),true);
  assert.equal(campaign.isUnlocked(LEVELS[1]),false);
  campaign.completeLevel(LEVELS[0],{cost:1000,maxPower:3000,maxTemperature:39,completionTime:310});
  assert.equal(campaign.isUnlocked(LEVELS[1]),true);
  const restored=new CampaignManager({storage});
  assert.equal(restored.isCompleted(LEVELS[0]),true);
});

test('zone temperature objective reads simulated air cells',()=>{
  const world=new World(6,6),level={zones:[{id:'z',name:'Zone',x:1,y:1,width:3,height:3}],objectives:[{type:'zoneTemperature',zoneId:'z',max:30}]};
  world.setTemperature(2,2,35);
  const system=new ObjectiveSystem(world,level,metrics()),status=system.evaluate();
  assert.equal(status[0].ok,false);
  world.setTemperature(2,2,25);
  assert.equal(system.evaluate()[0].ok,true);
});

test('mission event changes machine load at configured time',()=>{
  const world=new World(4,4),machine=new Machine(1,1,{heatOutput:1000});machine.category='serverRack';world.addEntity(machine);
  const level={events:[{time:180,type:'machineLoad',filter:{category:'serverRack'},multiplier:1.3}]};
  const events=new MissionEventSystem(world,level);
  events.update(179);assert.equal(machine.loadMultiplier,1);
  events.update(180);assert.equal(machine.loadMultiplier,1.3);
  events.update(300);assert.equal(machine.loadMultiplier,1.3);
});

test('campaign data center keeps water-cooling tools available alongside simple cooling',()=>{
  const level=LEVELS[5],world=new LevelManager().load(level),simulation=new Simulation(world,level);
  const locked=world.entities.filter(e=>e.locked);
  assert.ok(locked.length>=2);
  assert.equal(world.entities.some(e=>['pipe','pump','tank','radiator','exchanger'].includes(e.type)),false);
  assert.equal(simulation.simpleCooling,true);
  assert.equal(simulation.waterCooling,true);
  assert.ok(simulation.fluid);
  const build=new BuildSystem(world,simulation,{inventory:level.inventory});
  for(const tool of ['pipe','pump','tank','radiator','exchanger'])assert.ok(build.catalog[tool],tool);
  for(const tool of ['airHandler','condenser','refrigerantLine','smallDuct','returnVent'])assert.equal(build.catalog[tool],undefined);
});

test('engineering sandbox uses climatization tools alongside water equipment',()=>{
  const world=new LevelManager().load(engineeringSandbox),simulation=new Simulation(world,engineeringSandbox);
  const build=new BuildSystem(world,simulation,{inventory:engineeringSandbox.inventory});
  assert.equal(simulation.simpleCooling,true);assert.equal(simulation.engineeringHvac,undefined);assert.equal(simulation.waterCooling,true);
  for(const tool of ['coolingUnit','duct','supplyVent','pipe','pump','tank','radiator','exchanger'])assert.ok(build.catalog[tool],tool);
  for(const tool of ['airHandler','condenser','refrigerantLine','smallDuct','mediumDuct','largeDuct','returnVent','damper'])assert.equal(build.catalog[tool],undefined);
});
