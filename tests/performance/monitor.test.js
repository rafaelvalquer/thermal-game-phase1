import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceMonitor } from '../../src/performance/PerformanceMonitor.js';

test('performance monitor averages the latest frames and reports event rates',()=>{
  let time=0;const monitor=new PerformanceMonitor({windowSize:2,clock:()=>time});
  monitor.begin('airflowMs');time+=4;monitor.end('airflowMs');monitor.count('pressureSolveCount');monitor.set('visibleEntities',10);monitor.set('totalEntities',20);time=16;monitor.endFrame(time);
  monitor.count('pressureSolveCount');time=32;monitor.endFrame(time);
  monitor.count('pressureSolveCount',3);time=48;monitor.endFrame(time);
  const snapshot=monitor.snapshot();assert.equal(snapshot.fps,62.5);assert.equal(monitor.currentFps(),snapshot.fps);assert.equal(snapshot.pressureSolveCount,125);assert.equal(snapshot.visibleEntities,10);assert.equal(snapshot.totalEntities,20);
  time=64;monitor.endFrame(time);assert.equal(monitor.currentFps(),62.5,'rolling frame rate drops the oldest frame in constant time');
});

test('performance monitor exposes detailed V2 phase timings, path counts, topology rates, and save bytes',()=>{
  let time=0;const monitor=new PerformanceMonitor({clock:()=>time});
  for(const key of ['coolingPrepareMs','coolingExchangeMs','ventCoverageMs','technicianDispatchMs','technicianPathfindingMs','hydraulicSolveMs','powerSnapshotMs','thermalConductMs','uiGraphMs','saveMs']){monitor.begin(key);time+=1;monitor.end(key);}
  monitor.count('pathsCalculated',2);monitor.count('thermalTopologyRebuildCount');monitor.set('saveBytes',123456);monitor.set('saveCaptureMs',3);monitor.set('saveSerializeMs',7);monitor.set('saveStorageMs',2);time+=16;monitor.endFrame(time);
  const snapshot=monitor.snapshot();
  for(const key of ['powerSnapshotMs','thermalConductMs','uiGraphMs'])assert.equal(snapshot[key],1);
  assert.equal(snapshot.pathsCalculated,2000/26);assert.equal(snapshot.thermalTopologyRebuildCount,1000/26);assert.equal(snapshot.saveBytes,123456);assert.equal(snapshot.saveCaptureMs,3);assert.equal(snapshot.saveSerializeMs,7);assert.equal(snapshot.saveStorageMs,2);
});

test('performance monitor reports real save event percentiles separately from per-frame cost',()=>{
  let time=0;const monitor=new PerformanceMonitor({clock:()=>time});
  monitor.recordSave(4,1000);time=1000;monitor.endFrame(time);
  monitor.recordSave(12,2000);time=2000;monitor.endFrame(time);
  monitor.recordSave(8,3000);time=3000;monitor.endFrame(time);
  const snapshot=monitor.snapshot();
  assert.equal(snapshot.saveEventsPerSec,1);
  assert.equal(snapshot.saveDurationP50Ms,8);
  assert.equal(snapshot.saveDurationP95Ms,12);
  assert.equal(snapshot.saveDurationMaxMs,12);
  assert.equal(snapshot.saveBytes,3000);
  assert.equal(snapshot.saveMs,0,'event duration must not be inferred from time divided over frames');
  assert.equal(percentileP95([4,12]),12,'nearest-rank p95 includes the slowest save in small samples');
  const smallSample=new PerformanceMonitor({clock:()=>time});smallSample.recordSave(4,1000);smallSample.recordSave(12,2000);
  assert.equal(smallSample.snapshot().saveDurationP95Ms,12);
});

function percentileP95(values){return values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];}

test('performance monitor records long and severe frames and V3 phase metrics',()=>{
  let time=0;const monitor=new PerformanceMonitor({clock:()=>time});
  monitor.begin('fluidTransportMs');time+=3;monitor.end('fluidTransportMs');
  monitor.begin('thermalStatsMs');time+=2;monitor.end('thermalStatsMs');
  time=40;monitor.endFrame(time);time=100;monitor.endFrame(time);
  const snapshot=monitor.snapshot();
  assert.equal(snapshot.fluidTransportMs,1.5);assert.equal(snapshot.thermalStatsMs,1);
  assert.ok(snapshot.longFrameCount>0);assert.ok(snapshot.severeFrameCount>0);
});

test('performance monitor reports GC events when available and samples large heap drops',()=>{
  let time=0,heap=12*1024*1024,observer;
  class FakePerformanceObserver{
    static supportedEntryTypes=['gc'];
    constructor(callback){this.callback=callback;observer=this;}
    observe(options){assert.equal(options.type,'gc');}
    disconnect(){this.disconnected=true;}
  }
  const monitor=new PerformanceMonitor({clock:()=>time,PerformanceObserverClass:FakePerformanceObserver,memoryUsage:()=>heap,memorySampleInterval:1});
  observer.callback({getEntries:()=>[{duration:4}]});
  time=16;monitor.endFrame(time);heap=10*1024*1024;time=32;monitor.endFrame(time);
  const snapshot=monitor.snapshot();
  assert.equal(snapshot.gcSupported,true);assert.equal(snapshot.gcMs,2);
  assert.equal(snapshot.gcCount,31.25);assert.equal(snapshot.heapDropBytes,2*1024*1024);
  assert.equal(snapshot.heapDropCount,31.25);assert.equal(snapshot.heapUsedBytes,10*1024*1024);
  monitor.dispose();assert.equal(observer.disconnected,true);
});
