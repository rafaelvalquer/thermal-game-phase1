import test from 'node:test';
import assert from 'node:assert/strict';
import { StaticMapCache } from '../../src/rendering/StaticMapCache.js';
import { World } from '../../src/world/World.js';

test('static map cache redraws only when material topology changes',()=>{
  let builds=0,draws=0;const offscreenContext={setTransform(){},clearRect(){}};
  const canvasFactory=(width,height)=>({width,height,getContext:()=>offscreenContext}),cache=new StaticMapCache({canvasFactory});
  const renderer={draw(){builds++;}},ctx={drawImage(){draws++;}},world=new World(5,4),zones=[];
  cache.draw(ctx,world,16,zones,renderer);cache.draw(ctx,world,16,zones,renderer);
  assert.equal(builds,1);assert.equal(draws,2);
  world.setMaterial(2,2,'concrete');cache.draw(ctx,world,16,zones,renderer);
  assert.equal(builds,2);assert.equal(draws,3);
});
