import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityRenderer } from '../../src/rendering/EntityRenderer.js';
import { World } from '../../src/world/World.js';
import { Technician } from '../../src/entities/Technician.js';

test('entity draw order is cached until the world visual version changes',()=>{
  const world=new World(20,10);world.addEntity({id:1,type:'fixture',x:1,y:4});world.addEntity({id:2,type:'fixture',x:1,y:2});
  const renderer=new EntityRenderer();renderer.sprites={fallback:null,visualFootY:()=>0,draw:()=>true,isAnimated:()=>false};
  renderer.draw({},world,16,'normal',0);const order=renderer.cachedOrder;
  renderer.draw({},world,16,'normal',0);assert.equal(renderer.cachedOrder,order);
  world.addEntity({id:3,type:'fixture',x:1,y:3});renderer.draw({},world,16,'normal',0);
  assert.notEqual(renderer.cachedOrder,order);assert.deepEqual(renderer.cachedOrder.map(item=>item.entity.id),[2,3,1]);
});

test('moving a technician reorders the dynamic layer without sorting static entities again',()=>{
  const world=new World(20,10);world.addEntity({id:1,type:'fixture',x:1,y:4});world.addEntity({id:2,type:'fixture',x:1,y:2});
  const tech=world.addEntity(new Technician(2,2)),renderer=new EntityRenderer();let sorts=0;
  renderer.sprites={fallback:null,visualFootY:()=>{sorts++;return 0;},draw:()=>true,isAnimated:()=>false};
  renderer.draw({},world,16,'normal',0);const staticOrder=renderer.cachedOrder,staticSorts=sorts;
  world.moveEntity(tech,3,3);renderer.draw({},world,16,'normal',0);
  assert.equal(renderer.cachedOrder,staticOrder);assert.equal(sorts-staticSorts,1);
});
