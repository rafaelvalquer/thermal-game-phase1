import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceMonitor } from '../../src/performance/PerformanceMonitor.js';

test('performance monitor averages the latest frames and reports event rates',()=>{
  let time=0;const monitor=new PerformanceMonitor({windowSize:2,clock:()=>time});
  monitor.begin('airflowMs');time+=4;monitor.end('airflowMs');monitor.count('pressureSolveCount');monitor.set('visibleEntities',10);monitor.set('totalEntities',20);time=16;monitor.endFrame(time);
  monitor.count('pressureSolveCount');time=32;monitor.endFrame(time);
  monitor.count('pressureSolveCount',3);time=48;monitor.endFrame(time);
  const snapshot=monitor.snapshot();assert.equal(snapshot.fps,62.5);assert.equal(snapshot.pressureSolveCount,125);assert.equal(snapshot.visibleEntities,10);assert.equal(snapshot.totalEntities,20);
});
