import test from 'node:test';
import assert from 'node:assert/strict';
import { browserBenchmarkScenarios, createBrowserBenchmarkLevel, BrowserPerformanceBenchmark } from '../../src/dev/BrowserPerformanceBenchmark.js';
import { COOLING_UNIT_MODELS } from '../../src/entities/CoolingUnitModels.js';

test('browser benchmark profiles include the 100–400 rack acceptance scenarios',()=>{
  const scenarios=browserBenchmarkScenarios();
  assert.deepEqual(Object.keys(scenarios),['A','B','C','E']);
  assert.deepEqual([scenarios.A.racks,scenarios.B.racks,scenarios.C.racks,scenarios.E.racks],[100,200,300,400]);
  const level=createBrowserBenchmarkLevel('E'),counts={};
  for(const entity of level.entities)counts[entity.type]=(counts[entity.type]||0)+1;
  assert.equal(counts.serverRack,400);assert.equal(counts.coolingUnit,40);assert.equal(counts.supplyVent,120);assert.equal(counts.duct,600);assert.equal(counts.technician,50);
  assert.equal(level.performanceBenchmark,'E');assert.throws(()=>createBrowserBenchmarkLevel('D'),/desconhecido/);
  assert.equal(level.map.height,32,'the dense installation stays within a representative data-center footprint');
  assert.equal(level.map.rooms.length,1,'pressure work is confined to the closed data hall');
  const saveLevel=createBrowserBenchmarkLevel('E',{sandboxSave:true});
  assert.equal(saveLevel.datacenterSandbox,true);assert.equal(saveLevel.performanceBenchmarkSave,true);assert.equal(saveLevel.datacenter.powerCapacityKW,1e9);
  assert.equal(level.datacenterSandbox,undefined,'the ordinary renderer benchmark remains independent from sandbox saves');
  const racks=level.entities.filter(entity=>entity.type==='serverRack');
  const vents=level.entities.filter(entity=>entity.type==='supplyVent');
  const coolingUnits=level.entities.filter(entity=>entity.type==='coolingUnit');
  for(const vent of vents){
    const nearestRack=racks.reduce((best,rack)=>Math.min(best,Math.abs(rack.x-vent.x)+Math.abs(rack.y-vent.y)),Infinity);
    assert.ok(nearestRack<=5,`vent at ${vent.x},${vent.y} must be near the rack rows`);
  }
  assert.ok(level.entities.filter(entity=>entity.type==='coolingUnit').every(unit=>unit.y>=2&&unit.y<=21));
  assert.ok(racks.reduce((sum,rack)=>sum+rack.heatOutput,0)<=coolingUnits.length*COOLING_UNIT_MODELS.commercial.ratedCoolingCapacity,
    'the stress scene should exercise 400 racks without deliberately exceeding its installed cooling capacity');
});

test('browser benchmark reports canvas frame percentiles, full loop cost, render breakdown, and recent history',()=>{
  const monitor={snapshot:()=>({fpsP50:60,fpsP95Low:42,frameTimeP50:16.7,frameTimeP95:23.8,gameLoopWorkMs:11,gameLoopUpdateMs:5,gameLoopUpdates:2,gcSupported:true,gcCount:.5,gcMs:.2,heapUsedBytes:1000,heapPeakBytes:2000,heapDropBytes:100,heapDropCount:.1,saveMs:.4,saveCaptureMs:3,saveStateMs:.1,saveTilesMs:.2,saveEntitiesMs:2,saveUtilitiesMs:.4,saveBuildMs:.3,saveSerializeMs:8,saveStorageMs:2,saveBytes:2000,saveBytesEstimated:true,saveEventsPerSec:.1,saveDurationP50Ms:4,saveDurationP95Ms:12,saveDurationMaxMs:14,coolingPathAllocations:0,totalEntities:450,visibleEntities:420,renderedDucts:600,renderEntitiesMs:7.2,renderDuctsMs:1.3})};
  const benchmark=new BrowserPerformanceBenchmark('E',monitor);let report;
  for(let frame=0;frame<120;frame++)report=benchmark.frame();
  assert.equal(report.scenario,'E');assert.equal(report.fpsP50,60);assert.equal(report.fpsP95Low,42);assert.equal(report.renderedDucts,600);
  assert.equal(report.history.length,2);assert.equal(report.history[1].sampledFrames,120);
  assert.equal(report.gameLoopWorkMs,11);assert.equal(report.gameLoopUpdateMs,5);assert.equal(report.gameLoopUpdates,2);
  assert.equal(report.gcSupported,true);assert.equal(report.gcMs,.2);assert.equal(report.heapDropCount,.1);assert.equal(report.saveMs,.4);assert.equal(report.saveBytes,2000);assert.equal(report.saveDurationP95Ms,12);assert.equal(report.saveEventsPerSec,.1);assert.equal(report.saveCaptureMs,3);assert.equal(report.saveEntitiesMs,2);assert.equal(report.saveBytesEstimated,true);assert.equal(report.saveSerializeMs,8);assert.equal(report.saveStorageMs,2);
  assert.equal(report.renderEntitiesMs,7.2);assert.equal(report.renderDuctsMs,1.3);
});
