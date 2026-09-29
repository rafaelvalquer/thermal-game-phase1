import test from 'node:test';
import assert from 'node:assert/strict';
import { CoolingDuctRenderer } from '../../src/rendering/cooling/CoolingDuctRenderer.js';

class FakeCanvas {
  constructor(width,height){this.width=width;this.height=height;this.drawCalls=0;this.context={
    setTransform(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},setLineDash(){},drawImage(){},
  };}
  getContext(){return this.context;}
}

function context(){return {imageSmoothingEnabled:true,draws:[],drawImage(...args){this.draws.push(args);}};}

test('normal and thermal duct layers are cached by topology, zoom resolution, and map size',()=>{
  const canvases=[],renderer=new CoolingDuctRenderer({canvasFactory:(w,h)=>{const canvas=new FakeCanvas(w,h);canvases.push(canvas);return canvas;}});
  const duct={type:'duct',x:2,y:1,networkStatus:'READY',networkId:'cooling-1'},world={width:8,height:4,utilityTopologyVersion:1,utilitySetByType:()=>new Set([duct]),utilityAt:()=>null,entityAt:()=>null};
  const first=context(),second=context();
  renderer.draw(first,world,16,'normal',1);
  renderer.draw(second,world,16,'normal',1);
  assert.equal(canvases.length,1);
  assert.equal(first.draws.length,1);assert.equal(second.draws.length,1);
  assert.equal(renderer.stats.renderedDucts,1);

  renderer.draw(context(),world,16,'thermal',1);
  assert.equal(canvases.length,2,'thermal coloring has its own retained layer');
  renderer.draw(context(),{...world,width:9},16,'normal',1);
  assert.equal(canvases.length,3,'a different world size cannot reuse the old raster');
});

test('duct raster rebuilds after topology changes and keeps direct-render fallback',()=>{
  let builds=0;const duct={type:'duct',x:0,y:0,networkStatus:'READY',networkId:'a'},world={width:2,height:2,utilityTopologyVersion:1,utilitySetByType:()=>new Set([duct]),utilityAt:()=>null,entityAt:()=>null};
  const renderer=new CoolingDuctRenderer({canvasFactory:(w,h)=>{builds++;return new FakeCanvas(w,h);}});
  renderer.draw(context(),world,16,'normal',1);world.utilityTopologyVersion++;
  renderer.draw(context(),world,16,'normal',1);assert.equal(builds,2);

  const fallback=new CoolingDuctRenderer({canvasFactory:()=>null}),calls={strokes:0};
  const ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){calls.strokes++;},arc(){},fill(){},setLineDash(){}};
  fallback.draw(ctx,world,16,'normal',1);assert.ok(calls.strokes>0);
});
