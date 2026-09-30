import test from 'node:test';
import assert from 'node:assert/strict';
import { CoolingFlowRenderer } from '../../src/rendering/cooling/CoolingFlowRenderer.js';
import { CoolingPathGeometryCache } from '../../src/rendering/cooling/CoolingPathGeometryCache.js';

function contextWithArcCounter(){
  const calls={arcs:0,positions:[],colors:[],alphas:[]};
  const ctx=new Proxy({save(){},restore(){},beginPath(){},fill(){calls.colors.push(this.fillStyle);calls.alphas.push(this.globalAlpha);},fillText(){},arc(x,y){calls.arcs++;calls.positions.push([x,y]);}},
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

test('cooling flow markers use supply temperature and move faster with higher branch flow',()=>{
  const renderer=new CoolingFlowRenderer(),network={status:'READY',sourceUnit:{x:1,y:1,maxAirFlow:2.5},paths:[
    {flowRate:.5,path:[{x:2,y:1}],vent:{x:3,y:1,airTemperature:16}},
  ]};
  const slow=contextWithArcCounter(),fast=contextWithArcCounter(),hotAir=contextWithArcCounter();
  renderer.draw(slow.ctx,[network],16,.1,1);renderer.draw(fast.ctx,[network],16,.5,1);
  network.paths[0].flowRate=1.2;network.paths[0].vent.airTemperature=36;renderer.draw(hotAir.ctx,[network],16,.5,1);
  assert.notDeepEqual(slow.calls.positions,fast.calls.positions,'markers progress toward the outlet over time');
  assert.notEqual(slow.calls.colors[0],hotAir.calls.colors[0],'warmer supply uses a different visual color');
  assert.ok(hotAir.calls.arcs>slow.calls.arcs,'higher flow increases marker density');
});

test('the last airflow marker segment ends at the outlet face toward its duct',()=>{
  const unit={x:1,y:1},duct={x:2,y:1},vent={x:3,y:1},path={unit,path:[duct],vent};
  const geometry=new CoolingPathGeometryCache().get(path,{sourceUnit:unit}),last=geometry.segments.at(-1);
  assert.equal(last.ax,2.5);assert.equal(last.ay,1.5);
  assert.ok(Math.abs(last.ax+last.dx-(3.16))<1e-8,'the flow ends inside the vent on its duct-facing side');
  assert.equal(last.ay+last.dy,1.5);
});

test('selected cooling network stays bright while unrelated particles are dimmed',()=>{
  const renderer=new CoolingFlowRenderer(),first={id:'cooling-a',status:'READY',sourceUnit:{x:0,y:0,maxAirFlow:2},ducts:[],vents:[]},second={id:'cooling-b',status:'READY',sourceUnit:{x:0,y:2,maxAirFlow:2},ducts:[],vents:[]};
  first.paths=[{flowRate:.5,path:[{x:1,y:0}],unit:first.sourceUnit,vent:{x:2,y:0,flowRate:.5,airTemperature:16}}];first.vents=[first.paths[0].vent];
  second.paths=[{flowRate:.5,path:[{x:1,y:2}],unit:second.sourceUnit,vent:{x:2,y:2,flowRate:.5,airTemperature:16}}];second.vents=[second.paths[0].vent];
  const ctx=contextWithArcCounter();renderer.draw(ctx.ctx,[first,second],16,.2,1,{type:'supplyVent',networkId:'cooling-a'});
  assert.ok(ctx.calls.alphas.some(alpha=>alpha>0&&alpha<.14),'the unselected network is attenuated');
  assert.ok(ctx.calls.alphas.some(alpha=>alpha>.4),'the selected network remains visible');
});
