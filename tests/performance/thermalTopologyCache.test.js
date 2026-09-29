import test from 'node:test';
import assert from 'node:assert/strict';
import { ThermalTopologyCache } from '../../src/simulation/thermal/ThermalTopologyCache.js';
import { ThermalSystem } from '../../src/simulation/ThermalSystem.js';
import { World } from '../../src/world/World.js';

test('thermal conductance edges rebuild only when material topology changes',()=>{
  const world=new World(8,5),cache=new ThermalTopologyCache(world);
  cache.ensureCurrent();const edges=cache.edges;
  assert.ok(edges.length>0);cache.ensureCurrent();assert.equal(cache.rebuildCount,1);assert.equal(cache.edges,edges);
  world.setTemperature(2,2,90);cache.ensureCurrent();assert.equal(cache.rebuildCount,1);
  world.setMaterial(2,2,'concrete');cache.ensureCurrent();assert.equal(cache.rebuildCount,2);
});

test('cached conduction remains conservative and keeps the calibrated copper transfer',()=>{
  const world=new World(2,1);world.setMaterial(0,0,'copper');world.setMaterial(1,0,'copper');
  world.setTemperature(0,0,100);world.setTemperature(1,0,0);const before=world.totalTileEnergy();
  new ThermalSystem(world,{generatedHeat:0,externalEnergy:0}).conduct(.05);
  assert.ok(world.temperatureAt(0,0)<100);assert.ok(world.temperatureAt(1,0)>0);assert.ok(Math.abs(world.totalTileEnergy()-before)<1e-9);
});
