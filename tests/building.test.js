import test from 'node:test';
import assert from 'node:assert/strict';
import { pipePathBetween, extendPipePath } from '../src/building/PipePath.js';
import { BuildSystem } from '../src/building/BuildSystem.js';
import { PlacementValidator } from '../src/building/PlacementValidator.js';
import { FluidSystem } from '../src/simulation/FluidSystem.js';
import { World } from '../src/world/World.js';
import { AirDuct, CoolingUnit, Pipe, SupplyVent } from '../src/entities/index.js';
import { CoolingNetworkBuilder } from '../src/simulation/cooling/CoolingNetworkBuilder.js';

test('pipe path fills straight and diagonal cursor gaps orthogonally',()=>{
  assert.deepEqual(pipePathBetween({x:1,y:1},{x:4,y:1}),[
    {x:2,y:1},{x:3,y:1},{x:4,y:1},
  ]);
  assert.deepEqual(pipePathBetween({x:1,y:1},{x:3,y:3}),[
    {x:2,y:1},{x:3,y:1},{x:3,y:2},{x:3,y:3},
  ]);
});

test('pipe path extension skips repeated cells while allowing bends',()=>{
  const path=[{x:1,y:1}];
  const extended=extendPipePath(extendPipePath(path,{x:3,y:1}),{x:3,y:3});
  const returned=extendPipePath(extended,{x:2,y:1});
  assert.deepEqual(extended,[
    {x:1,y:1},{x:2,y:1},{x:3,y:1},{x:3,y:2},{x:3,y:3},
  ]);
  assert.deepEqual(returned,[...extended,{x:2,y:3},{x:2,y:2}]);
});

for(const [tool,material,cost] of [['wall','concrete',35],['insulation','insulation',25],['copper','copper',80]]){
  test(`${tool} drag places each valid block once and respects blockers and resources`,()=>{
    const world=new World(7,4);world.addEntity({id:'blocker',type:'machine',x:3,y:1});
    const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:cost*2,inventory:{[tool]:3}});
    build.select(tool);
    const path=[{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1},{x:1,y:1}];
    assert.deepEqual(build.placeStructurePath(path),{placed:2,failed:2});
    assert.equal(world.materialAt(1,1).id,material);assert.equal(world.materialAt(2,1).id,material);
    assert.equal(world.materialAt(3,1).id,'air');assert.equal(world.materialAt(4,1).id,'air');
    assert.equal(build.budget,0);assert.equal(build.inventory[tool],1);
  });
}

test('demolish drag removes every built object and material in the rectangle with a full refund',()=>{
  const world=new World(7,5);world.thermalSystems={allBuildTools:true};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:1010,inventory:{wall:2,fan:1,duct:4,pipe:1}});
  for(const [tool,x,y] of [['wall',1,1],['wall',2,1],['fan',2,2],['duct',3,2],['pipe',1,1]]){build.select(tool);assert.equal(build.place(x,y).ok,true);}
  assert.equal(build.budget,780);build.select('demolish');
  const result=build.demolishArea({x:3,y:2},{x:1,y:1});
  assert.deepEqual({ok:result.ok,removed:result.removed,entities:result.entities,utilities:result.utilities,materials:result.materials,refund:result.refund},
    {ok:true,removed:5,entities:2,utilities:1,materials:2,refund:230});
  assert.equal(build.budget,1010);assert.equal(world.entities.length,0);assert.equal(world.allUtilities().length,0);
  assert.equal(world.materialAt(1,1).id,'air');assert.equal(world.materialAt(2,1).id,'air');
  assert.equal(build.inventory.wall,2);assert.equal(build.inventory.fan,1);assert.equal(build.inventory.duct,4);assert.equal(build.inventory.pipe,1);
});

test('demolish drag skips mission-locked equipment and reports protected items',()=>{
  const world=new World(4,4);world.thermalSystems={allBuildTools:true};world.addEntity({id:'mission-unit',type:'fan',x:1,y:1,enabled:true,locked:true});
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:500,inventory:{}});
  const result=build.demolishArea({x:1,y:1},{x:2,y:2});
  assert.equal(result.ok,false);assert.equal(result.blocked,1);assert.equal(world.entities.length,1);assert.equal(build.budget,500);
});

test('demolish drag removes unassigned server racks',()=>{
  const world=new World(4,4);world.thermalSystems={allBuildTools:true};
  const rack={id:'available-rack',type:'serverRack',x:2,y:2,isHeatMachine:true,contractId:null};world.addEntity(rack);
  let notified=null;world.datacenter={onRackRemoved(entity){notified=entity;},persist(){}};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:100,inventory:{}});

  const result=build.demolishArea({x:2,y:2});

  assert.equal(result.ok,true);assert.equal(result.entities,1);assert.equal(result.refund,0);
  assert.equal(world.entities.includes(rack),false);assert.equal(notified,rack);
});

test('pipe batch places valid cells, skips blocked cells, and charges only placed pipes',()=>{
  const world=new World(8,5);world.addEntity({id:'blocker',type:'machine',x:3,y:1});
  const simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{}};
  const build=new BuildSystem(world,simulation,{budget:30,inventory:{pipe:3}});
  build.select('pipe');
  const result=build.placePipePath([{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1},{x:4,y:1}]);
  assert.deepEqual(result,{placed:3,failed:1});
  assert.deepEqual(world.entities.filter(e=>e.type==='pipe').map(e=>[e.x,e.y]),[[1,1],[2,1],[4,1]]);
  assert.equal(build.budget,0);
  assert.equal(build.inventory.pipe,0);
});

test('pipe batch continues after resources run out and rejects non-pipe tools',()=>{
  const world=new World(5,3);
  const simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{}};
  const build=new BuildSystem(world,simulation,{budget:10,inventory:{pipe:2}});
  build.select('pipe');
  assert.deepEqual(build.placePipePath([{x:0,y:0},{x:1,y:0},{x:2,y:0}]),{placed:1,failed:2});
  build.select('fan');
  assert.deepEqual(build.placePipePath([{x:0,y:2}]),{placed:0,failed:1});
});

test('pipe click and drag can pass under walls without replacing the wall',()=>{
  const world=new World(7,4);world.setMaterial(2,1,'concrete');
  const simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{}};
  const build=new BuildSystem(world,simulation,{budget:50,inventory:{pipe:5,fan:1}});
  const validator=new PlacementValidator(world);
  assert.equal(validator.canPlace('pipe',2,1),true);
  assert.equal(validator.canPlace('fan',2,1),false);
  assert.equal(validator.canPlace('pump',2,1),false);

  build.select('pipe');
  assert.equal(build.place(1,1).ok,true);
  assert.deepEqual(build.placePipePath([{x:2,y:1},{x:3,y:1}]),{placed:2,failed:0});
  assert.equal(world.entityAt(2,1).type,'pipe');
  assert.equal(world.materialAt(2,1).id,'concrete');
  assert.equal(world.isAir(2,1),false);
  assert.equal(build.budget,20);

  const fluid=new FluidSystem(world,{ });
  const network=fluid.buildNetworks().find(item=>item.entities.includes(world.entityAt(2,1)));
  assert.equal(network.entities.length,3);
  assert.equal(network.neighbors.get(world.entityAt(2,1).id).length,2);

  build.select('demolish');
  assert.equal(build.place(2,1).ok,true);
  assert.equal(world.entityAt(2,1),undefined);
  assert.equal(world.materialAt(2,1).id,'concrete');
});

test('wall can be built over an existing pipe without removing it',()=>{
  const world=new World(5,3);
  const simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{}};
  const build=new BuildSystem(world,simulation,{budget:100,inventory:{pipe:2,wall:2}});

  build.select('pipe');
  assert.equal(build.place(2,1).ok,true);
  const pipe=world.entityAt(2,1);

  build.select('wall');
  assert.equal(build.canPlace('wall',2,1),true);
  assert.equal(build.place(2,1).ok,true);
  assert.equal(world.materialAt(2,1).id,'concrete');
  assert.equal(world.entityAt(2,1),pipe);

  const blocked=new World(5,3);
  blocked.addEntity({type:'pump',x:2,y:1});
  const blockedBuild=new BuildSystem(blocked,simulation,{budget:100,inventory:{wall:2}});
  blockedBuild.select('wall');
  assert.equal(blockedBuild.canPlace('wall',2,1),false);
});

test('pipe placement can form a T junction but rejects a fourth connection',()=>{
  const world=new World(7,7),center=new Pipe(3,3);world.addEntity(center);world.addEntity(new Pipe(2,3));world.addEntity(new Pipe(3,4));
  const validator=new PlacementValidator(world);
  assert.equal(validator.canPlace('pipe',4,3),true,'the third neighbor creates a T');
  world.addEntity(new Pipe(4,3));
  assert.equal(validator.canPlace('pipe',3,2),false,'a pipe cannot exceed three connections');
});

test('climatization duct preview and placement respect blockers and preserve utility behavior',()=>{
  const world=new World(7,4);world.setMaterial(1,1,'concrete');world.addEntity({id:'machine-blocker',type:'machine',x:3,y:1});
  const simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{}},build=new BuildSystem(world,simulation,{budget:150,inventory:{duct:4}});build.select('duct');
  const path=[{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1}],preview=build.ductPlacement.planPath('duct',path,{inventory:build.inventory.duct,budget:build.budget,cost:50});
  assert.deepEqual(preview.entries.map(point=>point.valid),[true,true,false,true]);assert.equal(world.allUtilities().length,0);assert.equal(build.inventory.duct,4);assert.equal(build.budget,150);
  assert.deepEqual(build.placeDuctPath(path),{placed:3,failed:1});assert.ok(world.allUtilities().every(item=>item.type==='duct'));
  assert.equal(world.materialAt(1,1).id,'concrete');assert.equal(build.inventory.duct,1);assert.equal(build.budget,0);
});

test('dragging a duct from one existing segment to another reuses both endpoints and connects the network immediately',()=>{
  const world=new World(12,6);world.thermalSystems={simpleCooling:true};
  const unit=new CoolingUnit(0,2),vent=new SupplyVent(10,2);world.addEntity(unit);world.addEntity(vent);
  for(const x of [1,2,8,9])world.addUtility(new AirDuct(x,2));
  const networks=new CoolingNetworkBuilder(world),simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{},cooling:{rebuild(){this.networks=networks.build();}}};
  simulation.cooling.rebuild();assert.ok(simulation.cooling.networks.every(network=>network.status!=='READY'));
  const build=new BuildSystem(world,simulation,{budget:500,inventory:{duct:10}});build.select('duct');
  const result=build.placeDuctPath(Array.from({length:6},(_,index)=>({x:index+2,y:2})));
  assert.deepEqual(result,{placed:5,failed:0});
  assert.equal(world.allUtilities().filter(item=>item.type==='duct').length,9);
  assert.equal(simulation.cooling.networks.length,1);
  assert.equal(simulation.cooling.networks[0].status,'READY');
});

test('placing or removing one duct immediately refreshes the connected cooling network',()=>{
  const world=new World(8,5),unit=new CoolingUnit(0,2),vent=new SupplyVent(4,2);
  world.addEntity(unit);world.addEntity(vent);world.addUtility(new AirDuct(1,2));world.addUtility(new AirDuct(3,2));
  const builder=new CoolingNetworkBuilder(world),simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{},cooling:{rebuild(){this.networks=builder.build();}}};
  simulation.cooling.rebuild();assert.ok(simulation.cooling.networks.every(network=>network.status!=='READY'));
  const build=new BuildSystem(world,simulation,{budget:500,inventory:{duct:2}});build.select('duct');
  assert.equal(build.place(2,2).ok,true);
  assert.equal(simulation.cooling.networks.length,1);assert.equal(simulation.cooling.networks[0].status,'READY');
  build.select('demolish');assert.equal(build.demolish(2,2).ok,true);
  assert.ok(simulation.cooling.networks.every(network=>network.status!=='READY'));
});

test('placing or removing a cold-air outlet immediately connects or disconnects it from adjacent ducts',()=>{
  const world=new World(8,5);world.thermalSystems={simpleCooling:true};
  const unit=new CoolingUnit(0,2);world.addEntity(unit);world.addUtility(new AirDuct(1,2));world.addUtility(new AirDuct(2,2));
  const builder=new CoolingNetworkBuilder(world),simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{},cooling:{rebuild(){this.networks=builder.build();}}};
  simulation.cooling.rebuild();
  const build=new BuildSystem(world,simulation,{budget:1000,inventory:{supplyVent:1}});build.select('supplyVent');
  const result=build.place(3,2);
  assert.equal(result.ok,true);
  assert.equal(result.entity.networkStatus,'READY');
  assert.equal(simulation.cooling.networks.length,1);
  assert.equal(simulation.cooling.networks[0].paths.length,1);
  build.select('demolish');assert.equal(build.demolish(3,2).ok,true);
  assert.equal(simulation.cooling.networks[0].status,'NO OUTLET');
});

test('simple cooling tools drag a single duct across a wall and connect a rotated cold outlet',()=>{
  const world=new World(9,5);world.thermalSystems={simpleCooling:true,coolingUnitModel:'compact'};world.setMaterial(3,2,'concrete');
  const simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{}};
  const build=new BuildSystem(world,simulation,{budget:9000,inventory:{coolingUnit:2,duct:2,supplyVent:1}});
  assert.ok(build.catalog.coolingUnit);assert.ok(build.catalog.duct);assert.ok(build.catalog.supplyVent);
  for(const tool of ['airHandler','returnVent','refrigerantLine','smallDuct','mediumDuct','largeDuct','damper','pipe','pump','radiator'])assert.equal(build.catalog[tool],undefined);
  build.select('coolingUnit');assert.equal(build.place(1,2).ok,true);
  assert.deepEqual(world.entitiesByType('coolingUnit')[0].direction,{x:1,y:0});
  build.rotate();build.select('coolingUnit');assert.equal(build.place(2,3).ok,true);
  assert.deepEqual(world.entitiesByType('coolingUnit')[1].direction,{x:0,y:1});
  assert.equal(world.entityAt(1,2).ratedCoolingCapacity,10000);assert.equal(build.budget,1000);
  build.select('duct');assert.deepEqual(build.placeDuctPath([{x:2,y:2},{x:3,y:2}]),{placed:2,failed:0});
  assert.equal(world.materialAt(3,2).id,'concrete');
  build.select('supplyVent');build.rotate();build.rotate();assert.equal(build.place(4,2).ok,true);
  assert.deepEqual(world.entityAt(4,2).direction,{x:0,y:-1});
  assert.equal(build.budget,700);
});

test('sandbox industrial condenser is a powered two-tile tool aligned to its discharge',()=>{
  const world=new World(8,6);world.thermalSystems={simpleCooling:true,allBuildTools:true};world.datacenterConfig={allBuildTools:true};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:30000,inventory:{industrialCoolingUnit:2}});
  assert.ok(build.catalog.industrialCoolingUnit);
  build.select('industrialCoolingUnit');assert.equal(build.canPlace('industrialCoolingUnit',2,2),true);
  const result=build.place(2,2),unit=result.entity;
  assert.equal(unit.ratedCoolingCapacity,110000);assert.equal(unit.maxAirFlow,12);assert.equal(unit.footprintLength,2);
  assert.equal(build.budget,16000);assert.equal(world.entityAt(3,2),unit);
  assert.equal(build.canPlace('fan',3,2),false);
  build.rotate();assert.equal(build.canPlace('industrialCoolingUnit',6,5),false,'rotated second tile cannot exceed map bounds');
  assert.equal(build.canPlace('industrialCoolingUnit',5,3),true);
  build.select('demolish');assert.equal(build.place(3,2).ok,true,'the secondary tile selects and removes the whole condenser');
  assert.equal(world.entitiesByType('coolingUnit').length,0);assert.equal(build.budget,30000);
  assert.equal(build.inventory.industrialCoolingUnit,2);
});

test('simple cooling campaign can also build water equipment when enabled',()=>{
  const world=new World(8,6);world.thermalSystems={simpleCooling:true,waterCooling:true,coolingUnitModel:'commercial'};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:3000,inventory:{pipe:4,pump:1,tank:1,radiator:1,exchanger:1,coolingUnit:1}});
  for(const tool of ['pipe','pump','tank','radiator','exchanger','coolingUnit'])assert.ok(build.catalog[tool],tool);
  assert.equal(build.catalog.industrialCoolingUnit,undefined,'industrial footprint tool stays out of campaign levels');
  for(const tool of ['airHandler','condenser','smallDuct','returnVent'])assert.equal(build.catalog[tool],undefined);
  build.select('pipe');assert.equal(build.place(1,1).ok,true);
  assert.equal(build.inventory.pipe,3);assert.equal(build.budget,2990);
});

test('cooling unit model selection applies the correct cost and restores its stock on demolition',()=>{
  const world=new World(5,5);world.thermalSystems={simpleCooling:true,coolingUnitModel:'commercial'};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:15000,inventory:{coolingUnit:1}});
  build.select('coolingUnit');assert.equal(build.place(2,2).ok,true);
  assert.equal(world.entityAt(2,2).ratedCoolingCapacity,55000);assert.equal(world.entityAt(2,2).missionId,'ac-1');assert.equal(build.budget,7000);
  build.select('demolish');assert.equal(build.place(2,2).ok,true);
  assert.equal(build.inventory.coolingUnit,1);assert.equal(build.budget,15000);
  build.select('coolingUnit');assert.equal(build.place(3,3).ok,true);
  assert.equal(world.entityAt(3,3).missionId,'ac-2');
});




