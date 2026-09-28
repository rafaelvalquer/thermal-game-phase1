import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../../../src/world/World.js';
import {Fan} from '../../../src/entities/Fan.js';
import {ExhaustFan} from '../../../src/entities/ExhaustFan.js';
import {AirGrid} from '../../../src/simulation/air/AirGrid.js';
import {ExhaustCaptureSystem} from '../../../src/simulation/air/ExhaustCaptureSystem.js';
import {StreamlineSeeder} from '../../../src/rendering/air/StreamlineSeeder.js';
import {StreamlineCache} from '../../../src/rendering/air/StreamlineCache.js';
import {StreamlineRenderer,simplifyStreamline} from '../../../src/rendering/air/StreamlineRenderer.js';

test('large maps distribute seeds across all regions and active equipment',()=>{
  const w=new World(112,72);w.airX.fill(.5);const seeder=new StreamlineSeeder();
  const regions=new Set(seeder.generate(w).map(s=>`${Math.floor(s.x/28)},${Math.floor(s.y/18)}`));
  assert.equal(regions.size,16);
  for(let y=5;y<70;y+=8)for(let x=4;x<110;x+=12)w.addEntity(new Fan(x,y));
  const seeds=seeder.generate(w);
  for(const e of w.entities)assert.ok(seeds.some(s=>s.sourceId===e.id));
  w.entities[0].powerBlocked=true;
  assert.ok(!seeder.generate(w).some(s=>s.sourceId===w.entities[0].id));
});

test('ambient seeding finds weak narrow jets between coarse grid points',()=>{
  const w=new World(40,24);for(let x=1;x<39;x++)w.airX[w.index(x,11)]=.06;
  const seeds=new StreamlineSeeder().generate(w);
  assert.ok(seeds.length>0);assert.ok(seeds.every(s=>Math.floor(s.y)===11));
});

test('empty cache stays reusable but local changes and direction reversals invalidate it',()=>{
  const w=new World(112,72),cache=new StreamlineCache();cache.get(w,1,0);
  for(let time=16;time<1000;time+=16)cache.get(w,1,time);
  assert.equal(cache.rebuildCount,1);
  w.airX[w.index(80,60)]=1;cache.get(w,1,1300);assert.equal(cache.rebuildCount,2);
  w.airX[w.index(80,60)]=-1;cache.get(w,1,1600);assert.equal(cache.rebuildCount,3);
  cache.get(w,1.25,1601);assert.equal(cache.rebuildCount,4);
  w.setMaterial(5,5,'concrete');cache.get(w,1.25,1602);assert.equal(cache.rebuildCount,5);
  cache.get(new World(112,72),1.25,1603);assert.equal(cache.rebuildCount,6);
});

test('drawing simplifies straight paths, preserves bends and reuses geometry',()=>{
  const points=Array.from({length:120},(_,i)=>({x:i/4,y:2}));
  assert.equal(simplifyStreamline(points).length,2);assert.equal(points.length,120);
  const bend=[{x:0,y:0},{x:2,y:0},{x:2,y:2}];assert.deepEqual(simplifyStreamline(bend),bend);
  const renderer=new StreamlineRenderer(),line={points};
  assert.equal(renderer.geometryFor(line,32),renderer.geometryFor(line,32));
  assert.notEqual(renderer.geometryFor(line,64),renderer.geometryFor(line,32));
  let strokes=0;const ctx={save(){},restore(){},stroke(){strokes++;}};
  renderer.draw(ctx,[line],32,0,1,{x:10000,y:10000,width:100,height:100});assert.equal(strokes,0);
});

test('capture geometry is reused and invalidated by walls, direction and radius',()=>{
  const w=new World(20,20),e=w.addEntity(new ExhaustFan(10,10)),grid=new AirGrid(w);grid.syncTopology();
  const capture=new ExhaustCaptureSystem(grid),first=capture.cells(e);assert.equal(capture.cells(e),first);
  w.setMaterial(9,10,'concrete');grid.syncTopology();const wall=capture.cells(e);
  assert.notEqual(wall,first);assert.ok(!wall.some(c=>c.x===9&&c.y===10));
  e.direction={x:0,y:1};const rotated=capture.cells(e);assert.notEqual(rotated,wall);
  e.captureRadius+=1;assert.notEqual(capture.cells(e),rotated);
});
