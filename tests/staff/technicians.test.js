import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { Technician } from '../../src/entities/Technician.js';
import { TechnicianSystem, TECHNICIAN_DAILY_WAGE, TECHNICIAN_HIRE_COST } from '../../src/simulation/TechnicianSystem.js';
import { ThermalSystem } from '../../src/simulation/ThermalSystem.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { technicianAt } from '../../src/entities/Technician.js';
import { Inspector } from '../../src/ui/Inspector.js';
import { Renderer } from '../../src/rendering/Renderer.js';
import { Game } from '../../src/game/Game.js';
import { UIManager } from '../../src/ui/UIManager.js';

function setup(){
  const world=new World(14,12);world.fill('air',25);
  const rack=world.addEntity(new ServerRack(8,6,{temperature:45,slaTemperature:35,airIntakeDirection:{x:0,y:-1}}));
  const build={budget:10000,onChange(){}};const system=new TechnicianSystem(world,build);
  return {world,rack,build,system};
}

test('hiring is budgeted, limited by rack count, and has a daily wage',()=>{
  const {system,build}=setup();
  const hired=system.hire();assert.equal(hired.ok,true);assert.equal(build.budget,10000-TECHNICIAN_HIRE_COST);
  assert.equal(system.payroll,TECHNICIAN_DAILY_WAGE);assert.equal(system.hire().ok,false);
  assert.equal(system.settleDay(1),TECHNICIAN_DAILY_WAGE);assert.equal(system.settleDay(1),0);
});

test('technician reaches a hot rack through walkable tiles and activates a brief assist',()=>{
  const {world,rack,system}=setup();world.addEntity(new Technician(2,2));
  for(let i=0;i<120;i++)system.update(.1);
  assert.ok(rack.staffBoostRemaining>0,'hot rack should receive temporary assistance');
  assert.ok(world.entities.some(e=>e.type==='coolingUnit'&&e.staffBoostRemaining>0)===false);
});

test('walls block staff pathfinding and do not create a remote boost',()=>{
  const {world,rack,system}=setup();world.addEntity(new Technician(2,6));
  for(let y=0;y<world.height;y++)world.setMaterial(5,y,'concrete');
  for(let i=0;i<80;i++)system.update(.1);
  assert.equal(rack.staffBoostRemaining,undefined);
});

test('temporary rack assistance accelerates heat exchange without changing the energy balance',()=>{
  const run=boost=>{
    const world=new World(9,9);world.fill('air',20);
    const rack=world.addEntity(new ServerRack(4,4,{temperature:50,airIntakeDirection:{x:0,y:-1},airExhaustDirection:{x:0,y:1}}));
    rack.staffBoostRemaining=boost?5:0;world.airY[world.index(4,3)]=.5;
    const metrics={externalEnergy:0};const thermal=new ThermalSystem(world,metrics),before=world.totalTileEnergy()+rack.energy;
    thermal.exchangeServerRack(rack,1);return {cooling:rack.coolingPower,after:world.totalTileEnergy()+rack.energy,before};
  };
  const normal=run(false),assisted=run(true);
  assert.ok(assisted.cooling>normal.cooling);assert.ok(Math.abs(assisted.after-assisted.before)<1e-6);
});

test('save and load preserve technician path and remaining boost duration',()=>{
  const storage={value:null,getItem(){return this.value;},setItem(_key,value){this.value=value;},removeItem(){this.value=null;}};
  const saves=new DataCenterSaveSystem({storage,key:'staff-test'}),world=new World(8,8),worker=world.addEntity(new Technician(2,3));
  Object.assign(worker,{targetRackId:99,goalX:4,goalY:3,path:[{x:3,y:3},{x:4,y:3}],pathIndex:1,moveProgress:.4,boostRemaining:4.5,cooldownRemaining:12});
  const build={budget:5000,inventory:{},placedEntities:new Map(),placedMaterials:new Map()};
  saves.save(saves.capture(world,{cash:5000},build));
  const restored=new World(8,8);assert.equal(saves.restoreWorld(restored,saves.load()),true);
  const loaded=restored.entitiesByType('technician')[0];assert.equal(loaded.boostRemaining,4.5);assert.equal(loaded.cooldownRemaining,12);assert.deepEqual(loaded.path,[{x:3,y:3},{x:4,y:3}]);assert.equal(loaded.moveProgress,.4);
});

test('assistance keeps the same rack target and its progress matches the eight-second thermal bonus',()=>{
  const {world,rack,system}=setup(),worker=world.addEntity(new Technician(8,7));
  Object.assign(worker,{action:'working',targetRackId:rack.id,boostRemaining:8,workProgress:0});rack.staffBoostRemaining=8;
  system.update(2);
  assert.equal(worker.action,'working');assert.equal(worker.targetRackId,rack.id);
  assert.equal(worker.workProgress,.25);assert.equal(rack.staffBoostRemaining,6);
  system.update(5.9);assert.equal(worker.action,'working');assert.equal(worker.targetRackId,rack.id);assert.ok(worker.workProgress<1);
  system.update(.1);assert.equal(worker.action,'cooldown');assert.equal(worker.targetRackId,null);
  assert.equal(worker.workProgress,1);assert.equal(rack.staffBoostRemaining,0);assert.equal(worker.cooldownRemaining,20);
});

test('idle patrol visits accessible positions beside racks instead of map extremes',()=>{
  const world=new World(20,16);world.fill('air',25);const rack=world.addEntity(new ServerRack(10,8,{temperature:25,slaTemperature:35}));
  const system=new TechnicianSystem(world,{budget:0}),worker=world.addEntity(new Technician(1,1));let reachedRackArea=false;
  for(let i=0;i<2400;i++){
    system.update(.1);
    if(Math.abs(worker.x-rack.x)+Math.abs(worker.y-rack.y)<=2)reachedRackArea=true;
    if(reachedRackArea){assert.ok(worker.x>=rack.x-2&&worker.x<=rack.x+2&&worker.y>=rack.y-2&&worker.y<=rack.y+2,'technician should remain near the rack after arriving');
      if(worker.action==='patrolling'&&worker.path.length)assert.equal(Math.abs(worker.goalX-rack.x)+Math.abs(worker.goalY-rack.y),1,'patrol stop should be beside a rack');}
  }
  assert.ok(reachedRackArea,'technician should patrol to the nearby-rack area');
  assert.ok(worker.facing.x||worker.facing.y,'movement keeps a cardinal facing direction');
});

test('technician stays put when no rack-side patrol tile is reachable',()=>{
  const world=new World(9,9);world.fill('air',25);const rack=world.addEntity(new ServerRack(4,4,{temperature:25,slaTemperature:35}));
  for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]])world.setMaterial(rack.x+dx,rack.y+dy,'concrete');
  const system=new TechnicianSystem(world,{budget:0}),worker=world.addEntity(new Technician(1,1));
  for(let i=0;i<80;i++)system.update(.1);
  assert.equal(worker.x,1);assert.equal(worker.y,1);assert.deepEqual(worker.path,[]);assert.equal(worker.action,'patrolling');
});

test('hottest reachable rack takes priority over cooler hot racks',()=>{
  const world=new World(12,9);world.fill('air',25);
  world.addEntity(new ServerRack(3,4,{temperature:44,slaTemperature:35}));const hottest=world.addEntity(new ServerRack(9,4,{temperature:61,slaTemperature:35}));
  const system=new TechnicianSystem(world,{budget:0}),worker=world.addEntity(new Technician(5,4));
  for(let i=0;i<80&&worker.action!=='working';i++)system.update(.1);
  assert.equal(worker.targetRackId,hottest.id);assert.equal(worker.action,'working');
});

test('legacy technician saves discard orphaned tasks while current work state persists',()=>{
  const storage={value:null,getItem(){return this.value;},setItem(_key,value){this.value=value;},removeItem(){this.value=null;}};
  const saves=new DataCenterSaveSystem({storage,key:'staff-legacy'}),world=new World(6,6),worker=world.addEntity(new Technician(2,2));
  Object.assign(worker,{action:'working',targetRackId:42,boostRemaining:3,workProgress:.625});
  const build={budget:1000,inventory:{},placedEntities:new Map(),placedMaterials:new Map()};saves.save(saves.capture(world,{cash:1000},build));
  const current=new World(6,6);saves.restoreWorld(current,saves.load());const restored=current.entitiesByType('technician')[0];
  assert.equal(restored.action,'working');assert.equal(restored.targetRackId,42);assert.equal(restored.workProgress,.625);
  const snapshot=saves.load();const old=snapshot.world.entities.find(item=>item.type==='technician');delete old.properties.action;delete old.properties.workProgress;
  const legacy=new World(6,6);saves.restoreWorld(legacy,snapshot);const oldWorker=legacy.entitiesByType('technician')[0];
  assert.equal(oldWorker.action,'patrolling');assert.equal(oldWorker.targetRackId,null);assert.equal(oldWorker.boostRemaining,0);
});

test('a nearby rack receives no assistance unless it is the technician target',()=>{
  const {world,rack,system}=setup(),worker=world.addEntity(new Technician(2,2));
  world.addEntity(new ServerRack(4,2,{temperature:45,slaTemperature:35}));
  Object.assign(worker,{action:'working',targetRackId:rack.id,boostRemaining:5});rack.staffBoostRemaining=5;
  const nearby=world.entitiesByType('serverRack')[1];nearby.staffBoostRemaining=0;
  system.update(.1);assert.equal(nearby.staffBoostRemaining,0);
});

test('technician hit testing follows its interpolated map position',()=>{
  const world=new World(8,8),worker=world.addEntity(new Technician(2,3));
  Object.assign(worker,{fromX:2,toX:3,fromY:3,toY:3,moveProgress:.75});
  assert.equal(technicianAt(world,2,3),null);assert.equal(technicianAt(world,3,3),worker);
});

test('clicking a technician selects it instead of placing the active build tool',()=>{
  const world=new World(8,8),worker=world.addEntity(new Technician(3,3));let placements=0,inspected=null;
  const game=Object.create(Game.prototype);Object.assign(game,{world,build:{selected:'fan',place(){placements++;},select(){},rotate(){}},renderer:{tile:16},mouse:{},hover:{x:0,y:0},ui:{inspectAt(x,y){inspected={x,y};}}});
  const previous=globalThis.addEventListener;globalThis.addEventListener=()=>{};
  try{game.setupInput();game.mouse.onPrimaryDown({x:3,y:3});assert.equal(game.pipeDrag,null);game.mouse.onPrimary({x:3,y:3});}
  finally{if(previous)globalThis.addEventListener=previous;else delete globalThis.addEventListener;}
  assert.equal(placements,0);assert.deepEqual(inspected,{x:3,y:3});assert.equal(worker.type,'technician');
});

test('UI inspection resolves technicians separately from world entity occupancy',()=>{
  const world=new World(8,8),worker=world.addEntity(new Technician(3,3)),ui=Object.create(UIManager.prototype);let target=null;
  Object.assign(ui,{game:{world,renderer:{selectedEntity:null}},inspector:{setTarget(value){target=value;}}});
  ui.inspectAt(3,3);assert.equal(target.kind,'entity');assert.equal(target.entity,worker);assert.equal(ui.game.renderer.selectedEntity,worker);
});

test('technician inspector exposes task, destination, progress, and remaining assistance time',()=>{
  const world=new World(8,8),rack=world.addEntity(new ServerRack(5,4,{name:'Rack Norte'})),worker=world.addEntity(new Technician(3,4));
  Object.assign(worker,{action:'working',targetRackId:rack.id,goalX:4,goalY:4,workProgress:.375,boostRemaining:5});
  const root={innerHTML:'',querySelector(){return null;}},inspector=new Inspector(root);inspector.setTarget({kind:'entity',entity:worker});inspector.update(world);
  for(const text of ['EM ATENDIMENTO','Rack Norte','Troca térmica +20%','38%','5.0 s'])assert.ok(root.innerHTML.includes(text),`missing ${text}`);
});

test('selected technician route is dashed to its task and disappears outside movement',()=>{
  const renderer=Object.create(Renderer.prototype);renderer.tile=16;renderer.camera={zoom:1};
  const rack={id:20,type:'serverRack',x:6,y:4},worker={id:21,type:'technician',action:'moving',targetRackId:20,x:2,y:4,fromX:2,toX:3,fromY:4,toY:4,moveProgress:.5,path:[{x:3,y:4},{x:4,y:4},{x:5,y:4}],pathIndex:0};
  renderer.selectedEntity=worker;const calls=[];const ctx={save(){},restore(){},setLineDash(value){calls.push(['dash',value.length]);},beginPath(){},moveTo(x,y){calls.push(['move',x,y]);},lineTo(x,y){calls.push(['line',x,y]);},stroke(){calls.push(['stroke']);},arc(){},fill(){},strokeRect(){}};
  assert.equal(renderer.drawTechnicianRoute(ctx,{entities:[rack,worker]}),true);assert.ok(calls.some(call=>call[0]==='dash'&&call[1]===2));
  assert.deepEqual(calls.find(call=>call[0]==='move'),['move',48,72]);
  worker.action='working';calls.length=0;assert.equal(renderer.drawTechnicianRoute(ctx,{entities:[rack,worker]}),false);assert.equal(calls.length,0);
  renderer.selectedEntity=null;worker.action='moving';assert.equal(renderer.drawTechnicianRoute(ctx,{entities:[rack,worker]}),false);
});
