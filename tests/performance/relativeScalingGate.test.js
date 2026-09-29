import test from 'node:test';
import assert from 'node:assert/strict';
import { relativeScalingGate } from '../../src/performance/RelativeScalingGate.js';

test('relative scaling gate allows proportional growth across larger benchmark scenes',()=>{
  const result=relativeScalingGate([
    {scenario:'A',averageMsPerTick:8},
    {scenario:'B',averageMsPerTick:11},
    {scenario:'C',averageMsPerTick:16},
    {scenario:'E',averageMsPerTick:22},
  ]);
  assert.deepEqual(result.failed,[]);
  assert.deepEqual(result.ratios.map(item=>item.ratio),[1.38,1.45,1.38]);
});

test('relative scaling gate rejects superlinear step-cost growth',()=>{
  const result=relativeScalingGate([
    {scenario:'A',averageMsPerTick:5},
    {scenario:'B',averageMsPerTick:13},
    {scenario:'C',averageMsPerTick:35},
  ]);
  assert.deepEqual(result.failed.map(item=>item.from+'→'+item.to),['A→B','B→C']);
});
