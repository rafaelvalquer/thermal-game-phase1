import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ThermalStatisticsSampler } from '../../src/simulation/thermal/ThermalStatisticsSampler.js';
import { PerformanceMonitor } from '../../src/performance/PerformanceMonitor.js';

test('thermal statistics sample the final air state and rebuild indices only after topology changes',()=>{
  const world=new World(3,2),metrics={},sampler=new ThermalStatisticsSampler(world,metrics);
  world.setTemperature(0,0,21);world.setTemperature(1,0,37);world.setTemperature(2,0,29);
  const first=sampler.sample();
  assert.equal(first.count,6);assert.equal(first.max,37);assert.equal(first.sum,21+37+29+3*25);
  assert.equal(sampler.sample().count,6);assert.equal(sampler.rebuildCount,1);
  world.setTemperature(2,1,44);assert.equal(sampler.sample().max,44);assert.equal(sampler.rebuildCount,1);
  world.setMaterial(1,1,'concrete');assert.equal(sampler.sample().count,5);assert.equal(sampler.rebuildCount,2);
});

test('thermal statistics work is exposed in performance timing',()=>{
  let time=0;const monitor=new PerformanceMonitor({clock:()=>time});
  monitor.begin('thermalStatsMs');time+=2;monitor.end('thermalStatsMs');time+=16;monitor.endFrame(time);
  assert.equal(monitor.snapshot().thermalStatsMs,2);
});
