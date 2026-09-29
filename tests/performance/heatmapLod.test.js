import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { HeatmapRenderer } from '../../src/rendering/HeatmapRenderer.js';

function context(){let fills=0;return {get fills(){return fills;},save(){},restore(){},fillRect(){fills++;},strokeRect(){}};}

test('thermal heatmap uses 1x1, 2x2 and 4x4 visual blocks as zoom decreases',()=>{
  const world=new World(16,16),renderer=new HeatmapRenderer(),tile=10;
  for(const [zoom,expected] of [[1,256],[.7,64],[.4,16]]){const ctx=context();renderer.draw(ctx,world,tile,null,zoom,0);assert.equal(ctx.fills,expected);}
});
