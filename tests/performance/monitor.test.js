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

test('performance monitor exposes detailed V2 phase timings, path counts, topology rates, and save bytes',()=>{
  let time=0;const monitor=new PerformanceMonitor({clock:()=>time});
  for(const key of ['coolingPrepareMs','coolingExchangeMs','ventCoverageMs','technicianDispatchMs','technicianPathfindingMs','hydraulicSolveMs','powerSnapshotMs','thermalConductMs','uiGraphMs','saveMs']){monitor.begin(key);time+=1;monitor.end(key);}
  monitor.count('pathsCalculated',2);monitor.count('thermalTopologyRebuildCount');monitor.set('saveBytes',123456);time+=16;monitor.endFrame(time);
  const snapshot=monitor.snapshot();
  for(const key of ['powerSnapshotMs','thermalConductMs','uiGraphMs'])assert.equal(snapshot[key],1);
  assert.equal(snapshot.pathsCalculated,2000/26);assert.equal(snapshot.thermalTopologyRebuildCount,1000/26);assert.equal(snapshot.saveBytes,123456);
});
