import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewportCulling } from '../../src/rendering/ViewportCulling.js';

test('viewport culling derives visible tile bounds with a margin and clamps to the map',()=>{
  const viewport=ViewportCulling.fromBounds({x:100,y:50,width:140,height:70},10,2);
  assert.deepEqual(viewport.tileBounds({width:40,height:20}),{minX:8,minY:3,maxX:26,maxY:14});
  assert.equal(viewport.contains(9,5),true);assert.equal(viewport.contains(30,5),false);
  const fromCamera=ViewportCulling.fromCamera({screenToWorld:(x,y)=>({x:x+100,y:y+50})},100,60,10,{margin:1});
  assert.deepEqual(fromCamera.tileBounds({width:40,height:20}),{minX:9,minY:4,maxX:21,maxY:12});
});
