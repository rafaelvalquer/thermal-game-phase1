import test from 'node:test';
import assert from 'node:assert/strict';
import { pipePathBetween, extendPipePath } from '../src/building/PipePath.js';
import { BuildSystem } from '../src/building/BuildSystem.js';
import { PlacementValidator } from '../src/building/PlacementValidator.js';
import { FluidSystem } from '../src/simulation/FluidSystem.js';
import { World } from '../src/world/World.js';
import { ReturnVent } from '../src/entities/ReturnVent.js';

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

test('duct preview and placement do not persist a supply or return role',()=>{
  const world=new World(7,4);world.setMaterial(1,1,'concrete');world.addEntity(new ReturnVent(0,1));
  world.addEntity({id:'machine-blocker',type:'machine',x:3,y:1});
  const simulation={totalInternalEnergy:()=>0,registerConstruction:()=>{}};
  const build=new BuildSystem(world,simulation,{budget:420,inventory:{mediumDuct:3}});build.select('mediumDuct');
  const path=[{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1}];
  const preview=build.ductPlacement.planPath('mediumDuct',path,{inventory:build.inventory.mediumDuct,budget:build.budget,cost:140});
  assert.deepEqual(preview.entries.map(point=>point.valid),[true,true,false,true]);
  assert.ok(preview.entries.every(point=>point.role===undefined));
  assert.equal(world.allUtilities().length,0);assert.equal(build.inventory.mediumDuct,3);assert.equal(build.budget,420);
  assert.deepEqual(build.placeDuctPath(path),{placed:3,failed:1});
  assert.equal(world.allUtilities().filter(item=>item.role!==undefined).length,0);
  assert.equal(world.materialAt(1,1).id,'concrete');assert.equal(build.inventory.mediumDuct,0);assert.equal(build.budget,0);
});
