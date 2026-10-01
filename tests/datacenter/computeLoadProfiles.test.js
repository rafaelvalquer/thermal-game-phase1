import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLoadDemand, nextComputeLoadPeak } from '../../src/datacenter/compute/ComputeLoadProfiles.js';
import { World } from '../../src/world/World.js';
import { ComputeRack } from '../../src/entities/ComputeRack.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';

const peakHour=(profile,id='client-A',day=5)=>{
  let peak={value:-Infinity,hour:0};
  for(let hour=0;hour<24;hour+=.25){const value=computeLoadDemand(profile,hour,day,id);if(value>peak.value)peak={value,hour};}
  return peak;
};

test('LOAD-001 Business reaches its peak in the early afternoon',()=>{
  for(const id of ['biz-A','biz-B','biz-C']){const peak=peakHour('business',id);assert.ok(peak.hour>=12&&peak.hour<=16,`${id}: ${peak.hour}`);}
});

test('LOAD-002 Business demand is lower before work hours than during its peak',()=>{
  assert.ok(computeLoadDemand('business',3,5,'biz-A')<peakHour('business','biz-A').value);
});

test('LOAD-003 Streaming reaches its peak in the evening',()=>{
  for(const id of ['stream-A','stream-B','stream-C']){const peak=peakHour('streaming',id);assert.ok(peak.hour>=19&&peak.hour<=23,`${id}: ${peak.hour}`);}
});

test('LOAD-004 Streaming mornings are quieter than its evening peak',()=>{
  assert.ok(computeLoadDemand('streaming',9,5,'stream-A')<peakHour('streaming','stream-A').value);
});

test('LOAD-005 Storage has a stable daytime baseline and a controlled overnight backup peak',()=>{
  assert.ok(computeLoadDemand('storage',2,4,'storage-A')>computeLoadDemand('storage',13,4,'storage-A'));
  assert.ok(computeLoadDemand('storage',2,4,'storage-A')<=.6);
});

test('LOAD-006 AI cycles through repeatable processing bursts instead of a daily sine wave',()=>{
  const values=Array.from({length:96},(_,index)=>computeLoadDemand('ai',index*.25,8,'ai-A'));
  assert.ok(Math.max(...values)>.9);assert.ok(Math.min(...values)<.65);assert.notDeepEqual(values.slice(0,48),values.slice(48));
  assert.equal(computeLoadDemand('ai',12.25,8,'ai-A'),computeLoadDemand('ai',12.25,8,'ai-A'));
});

test('LOAD-007 Constant stays within the near-constant 45–55% range',()=>{
  for(let day=1;day<=5;day++)for(let hour=0;hour<24;hour+=.5){const value=computeLoadDemand('constant',hour,day,'constant-A');assert.ok(value>=.45&&value<=.55);}
});

test('LOAD-008 the same contract, day and time always produces the same demand',()=>{
  const first=computeLoadDemand('business',13.75,21,'contract-repeat');
  assert.equal(first,computeLoadDemand('business',13.75,21,'contract-repeat'));
  assert.equal(computeLoadDemand('ai',13.75,21,'contract-repeat'),computeLoadDemand('ai',13.75,21,'contract-repeat'));
});

test('LOAD-009 different contracts receive deterministic but distinct curves',()=>{
  const ids=['client-A','client-B','client-C','client-D','client-E'];
  const curves=ids.map(id=>Array.from({length:48},(_,index)=>computeLoadDemand('business',index*.5,2,id)).join(','));
  assert.ok(new Set(curves).size>1);
});

test('LOAD-010 every profile remains bounded and smooth through hour transitions',()=>{
  for(const profile of ['business','streaming','ai','storage','constant'])for(const id of ['load-A','load-B'])for(let day=1;day<=3;day++){
    let previous=computeLoadDemand(profile,0,day,id);
    for(let step=1;step<=96;step++){
      const value=computeLoadDemand(profile,step*.25,day,id);
      assert.ok(value>=0&&value<=1);assert.ok(Math.abs(value-previous)<.2,`${profile} jumped ${Math.abs(value-previous)}`);previous=value;
    }
  }
});

test('peak query identifies the next daily demand peak for a contract',()=>{
  const peak=nextComputeLoadPeak('business',8.5,3,'biz-peak');
  assert.ok(peak);assert.ok(peak.day===3||peak.day===4);assert.ok(peak.hour>=12&&peak.hour<=16);
  assert.equal(nextComputeLoadPeak('constant',8.5,3,'flat'),null);
});

test('derived Cloud load profile diagnostics are recalculated instead of stored in rack saves',()=>{
  const world=new World(5,5),rack=world.addEntity(new ComputeRack(2,2));
  rack.computeLoadProfiles=[{profile:'ai',demand:.95,nextPeak:{day:3,hour:14}}];
  const save=new DataCenterSaveSystem({storage:null,indexedDB:null}),snapshot=save.capture(world,{}, {budget:0,inventory:{},placedEntities:new Map(),placedMaterials:new Map()});
  assert.equal(Object.hasOwn(snapshot.world.entities[0].properties,'computeLoadProfiles'),false);
});
