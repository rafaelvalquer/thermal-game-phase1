import test from 'node:test';
import assert from 'node:assert/strict';
import { CoolingFlowRenderer } from '../../src/rendering/cooling/CoolingFlowRenderer.js';

function contextWithArcCounter(){
  const calls={arcs:0};
  const ctx=new Proxy({save(){},restore(){},beginPath(){},fill(){},fillText(){},arc(){calls.arcs++;}},
    {get(target,key){if(key in target)return target[key];return()=>{};},set(target,key,value){target[key]=value;return true;}});
  return {ctx,calls};
}

test('cooling flow particles scale with zoom and disappear when the source has no flow',()=>{
  const renderer=new CoolingFlowRenderer(),network={status:'READY',sourceUnit:{x:1,y:1,maxAirFlow:2.5},paths:[
    {flowRate:.5,path:[{x:2,y:1}],vent:{x:3,y:1}},
  ]};
  const low=contextWithArcCounter(),high=contextWithArcCounter();
  renderer.draw(low.ctx,[network],16,1,1);renderer.draw(high.ctx,[network],16,1,2);
  assert.equal(low.calls.arcs,2);assert.equal(high.calls.arcs,4);
  network.paths[0].flowRate=0;
  const idle=contextWithArcCounter();renderer.draw(idle.ctx,[network],16,2,2);
  assert.equal(idle.calls.arcs,0);
});

