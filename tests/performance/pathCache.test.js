import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Technician } from '../../src/entities/Technician.js';
import { NavigationGrid } from '../../src/simulation/staff/NavigationGrid.js';
import { TechnicianPathfinder } from '../../src/simulation/staff/TechnicianPathfinder.js';

test('path cache avoids repeat BFS and expires when navigation topology changes',()=>{
  const world=new World(20,12),navigation=new NavigationGrid(world),worker=world.addEntity(new Technician(1,1)),paths=new TechnicianPathfinder(world,navigation,{maxCachedPaths:2});
  const first=paths.findPath(1,1,16,8,worker),again=paths.findPath(1,1,16,8,worker);
  assert.ok(first?.length);assert.deepEqual(again,first);assert.equal(paths.calculations,1);assert.equal(paths.cacheHits,1);
  world.setMaterial(8,4,'concrete');paths.findPath(1,1,16,8,worker);
  assert.equal(paths.calculations,2,'topology changes invalidate old path keys');
  paths.findPath(1,1,17,8,worker);paths.findPath(1,1,18,8,worker);
  assert.ok(paths.pathCache.size<=2,'path cache is bounded with LRU eviction');
});
