import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreeBenchmarkSnapshot, ThreePerformanceBenchmark, THREE_BENCHMARK_MODES, THREE_BENCHMARK_SCENARIOS, checkThreeBenchmarkGate } from '../../src/dev/ThreePerformanceBenchmark.js';
import { ThreeQualityController } from '../../src/rendering/three/visual/ThreeQualityController.js';

test('THREE-001 dedicated benchmark profiles contain the requested 50–400 rack scale',()=>{
  assert.deepEqual(Object.keys(THREE_BENCHMARK_SCENARIOS),['A','B','C','D']);
  assert.deepEqual(Object.values(THREE_BENCHMARK_SCENARIOS).map(item=>[item.racks,item.auxiliaries,item.ducts]),[[50,20,100],[100,40,250],[200,80,500],[400,150,1000]]);
  assert.deepEqual(THREE_BENCHMARK_MODES,['normal','thermal','airflow','power','cooling']);
});

test('THREE-002 synthetic snapshots preserve 128×80 scale, stable IDs and shared air-duct topology',()=>{
  const snapshot=createThreeBenchmarkSnapshot('D','airflow'),ids=snapshot.equipment.map(item=>item.id),ducts=snapshot.equipment.filter(item=>item.type==='duct');
  assert.equal(snapshot.world.width,128);assert.equal(snapshot.world.height,80);assert.equal(new Set(ids).size,ids.length);
  assert.equal(ducts.length,1000);assert.ok(ducts.some(item=>item.ductShape==='straight'));assert.ok(ducts.every(item=>Array.isArray(item.ductConnections)));
  assert.equal(snapshot.equipment.filter(item=>item.type==='serverRack'||item.type==='computeRack').length,400);
});

test('THREE-003 browser runner measures each requested overlay and exposes renderer and memory metrics',async()=>{
  const calls=[];let renderCalls=0;
  const renderer={scene:{children:Array.from({length:12},()=>({isMesh:true}))},adapter:{info:{render:{calls:24,triangles:18000},memory:{}},renderer:{getContext:()=>({RENDERER:1,getParameter:()=> 'test gpu'})}},equipment:{},lastFrameTimings:{worldBuildMs:.1,equipmentSyncMs:.2,visualUpdateMs:.1,drawMs:.4},render(_snapshot,{overlay}){calls.push(overlay);renderCalls++;}};
  let timestamp=0;const benchmark=new ThreePerformanceBenchmark(renderer,{requestFrame:()=>Promise.resolve(timestamp+=1000/60)});
  const report=await benchmark.run({profiles:['A'],modes:['normal','thermal','airflow','power','cooling'],warmupFrames:1,frames:3,includeDynamic:false,includeConstruction:false});
  assert.equal(report.kind,'three-webgl');assert.equal(report.renderer,'test gpu');assert.equal(report.reports.length,5);assert.equal(renderCalls,20);
  assert.deepEqual([...new Set(calls)],THREE_BENCHMARK_MODES);assert.ok(report.reports.every(item=>item.fpsP50>0&&item.meshes===12&&item.renderCalls===24&&'heapGrowthBytes'in item&&'gcEvents'in item));
});

test('THREE-003b dynamic updates and build/remove benchmark preserve 1:1 equipment meshes',async()=>{
  let timestamp=0;const submitted=[];
  const equipment={records:[],getEquipmentIds(){return this.records.map(item=>item.id).sort();},getMeshIds(){return this.getEquipmentIds();}};
  const renderer={scene:{children:Array.from({length:12},()=>({isMesh:true}))},adapter:{info:{render:{calls:24,triangles:18000},memory:{geometries:12,textures:0}},renderer:{getContext:()=>({RENDERER:1,getParameter:()=> 'test gpu'})}},equipment,lastFrameTimings:{worldBuildMs:.1,equipmentSyncMs:.2,visualUpdateMs:.1,drawMs:.4,totalMs:.8},render(snapshot){equipment.records=[...snapshot.equipment];submitted.push(snapshot);}};
  const benchmark=new ThreePerformanceBenchmark(renderer,{requestFrame:()=>Promise.resolve(timestamp+=1000/60)});
  const report=await benchmark.run({profiles:['A','B','C','D'],modes:['normal'],warmupFrames:1,frames:4,dynamicProfile:'D'});
  assert.equal(report.reports.length,4);assert.equal(report.dynamicReports.length,1);assert.equal(report.dynamicReports[0].kind,'dynamic');
  assert.ok(submitted.some(snapshot=>snapshot.equipment.length>report.dynamicReports[0].equipment-1),'dynamic phase adds/removes equipment while rendering');
  assert.equal(report.constructionReport.ok,true);assert.deepEqual(report.constructionReport.stages.map(stage=>stage.equipment),[100,50,150,100]);
  assert.ok(report.constructionReport.stages.every(stage=>stage.orphanEquipmentCount===0&&stage.missingEquipmentCount===0&&stage.orphanMeshCount===0&&stage.missingMeshCount===0));
  assert.equal(report.constructionReport.finalEquipmentCount,100);assert.ok(!report.gate.failures.some(message=>message.includes('construção')));
});

test('THREE-004 relative gate checks draw-call instancing and bounded scale growth',()=>{
  const reports=['A','B','C','D'].map((scenario,index)=>({scenario,renderCalls:24,meshes:32,frameTimeP95:10*(index+1),renderTimeP95:8+index*2}));
  assert.equal(checkThreeBenchmarkGate(reports).ok,true);
  assert.equal(checkThreeBenchmarkGate(reports.map(item=>({...item,renderCalls:item.scenario==='D'?80:item.renderCalls}))).ok,false);
  assert.equal(checkThreeBenchmarkGate(reports.map(item=>({...item,frameTimeP95:item.scenario==='D'?140:item.frameTimeP95}))).ok,false);
  assert.equal(checkThreeBenchmarkGate(reports.map(item=>({...item,renderTimeP95:item.scenario==='D'?40:item.renderTimeP95}))).ok,false,'CPU render p95 growth must be gated');
  assert.equal(checkThreeBenchmarkGate([...reports,...[{scenario:'D',mode:'airflow',renderCalls:73,meshes:32,frameTimeP95:20,renderTimeP95:10}]]).ok,false,'every overlay must be included in the profile gate');
  const realSceneLevels=reports.map((item,index)=>({...item,renderCalls:64+index,meshes:66}));
  assert.equal(checkThreeBenchmarkGate(realSceneLevels).ok,true,'fixed shared scene groups stay valid below the measured 72-group ceiling');
  const capturedOverlays={A:[[64,8],[64,8.3],[65,9.6],[64,8.1],[64,8.2]],B:[[65,8.1],[65,8.6],[66,8.9],[65,7.8],[65,8.3]],C:[[67,8],[67,9.6],[68,6.9],[67,6.5],[67,6.7]],D:[[67,9.3],[67,5.4],[68,8.1],[67,6.3],[67,4.1]]};
  const measuredFullRun=Object.entries(capturedOverlays).flatMap(([scenario,modes])=>modes.map(([renderCalls,renderTimeP95])=>({scenario,renderCalls,renderTimeP95,frameTimeP95:16.8,meshes:66})));
  assert.equal(checkThreeBenchmarkGate(measuredFullRun).ok,true,'the captured 20-overlay WebGL run remains inside the calibrated gate');
});

test('THREE-005 quality changes use hysteresis and reset after intermediate FPS',()=>{
  const control=new ThreeQualityController('medium');
  assert.equal(control.sample(35),null);assert.equal(control.sample(42),null);assert.equal(control.quality,'medium');
  assert.equal(control.sample(35),null);assert.equal(control.sample(35),'low');assert.equal(control.quality,'low');
  assert.equal(control.sample(60),null);assert.equal(control.sample(60),'medium');
  assert.equal(control.sample(20),null);assert.equal(control.sample(60),null);assert.equal(control.quality,'medium');
});
