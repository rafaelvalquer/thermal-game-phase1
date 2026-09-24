import test from 'node:test';
import assert from 'node:assert/strict';
import { pipePathBetween, extendPipePath } from '../src/building/PipePath.js';
import { BuildSystem } from '../src/building/BuildSystem.js';
import { PlacementValidator } from '../src/building/PlacementValidator.js';
import { FluidSystem } from '../src/simulation/FluidSystem.js';
import { World } from '../src/world/World.js';

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

test('climatization duct preview and placement respect blockers and preserve utility behavior',()=>{
  const world=new World(7,4);world.setMaterial(1,1,'concrete');world.addEntity({id:'machine-blocker',type:'machine',x:3,y:1});
  const simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{}},build=new BuildSystem(world,simulation,{budget:150,inventory:{duct:4}});build.select('duct');
  const path=[{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1}],preview=build.ductPlacement.planPath('duct',path,{inventory:build.inventory.duct,budget:build.budget,cost:50});
  assert.deepEqual(preview.entries.map(point=>point.valid),[true,true,false,true]);assert.equal(world.allUtilities().length,0);assert.equal(build.inventory.duct,4);assert.equal(build.budget,150);
  assert.deepEqual(build.placeDuctPath(path),{placed:3,failed:1});assert.ok(world.allUtilities().every(item=>item.type==='duct'));
  assert.equal(world.materialAt(1,1).id,'concrete');assert.equal(build.inventory.duct,1);assert.equal(build.budget,0);
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
  build.select('duct');assert.deepEqual(build.placeDuctPath([{x:2,y:2},{x:3,y:2}]),{placed:1,failed:1});
  assert.equal(world.materialAt(3,2).id,'concrete');
  build.select('supplyVent');build.rotate();build.rotate();assert.equal(build.place(4,2).ok,true);
  assert.deepEqual(world.entityAt(4,2).direction,{x:0,y:-1});
  assert.equal(build.budget,750);
});

test('simple cooling campaign can also build water equipment when enabled',()=>{
  const world=new World(8,6);world.thermalSystems={simpleCooling:true,waterCooling:true,coolingUnitModel:'commercial'};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:3000,inventory:{pipe:4,pump:1,tank:1,radiator:1,exchanger:1,coolingUnit:1}});
  for(const tool of ['pipe','pump','tank','radiator','exchanger','coolingUnit'])assert.ok(build.catalog[tool],tool);
  for(const tool of ['airHandler','condenser','smallDuct','returnVent'])assert.equal(build.catalog[tool],undefined);
  build.select('pipe');assert.equal(build.place(1,1).ok,true);
  assert.equal(build.inventory.pipe,3);assert.equal(build.budget,2990);
});

test('cooling unit model selection applies the correct cost and restores its stock on demolition',()=>{
  const world=new World(5,5);world.thermalSystems={simpleCooling:true,coolingUnitModel:'commercial'};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:15000,inventory:{coolingUnit:1}});
  build.select('coolingUnit');assert.equal(build.place(2,2).ok,true);
  assert.equal(world.entityAt(2,2).ratedCoolingCapacity,25000);assert.equal(world.entityAt(2,2).missionId,'ac-1');assert.equal(build.budget,7000);
  build.select('demolish');assert.equal(build.place(2,2).ok,true);
  assert.equal(build.inventory.coolingUnit,1);assert.equal(build.budget,15000);
  build.select('coolingUnit');assert.equal(build.place(3,3).ok,true);
  assert.equal(world.entityAt(3,3).missionId,'ac-2');
});




