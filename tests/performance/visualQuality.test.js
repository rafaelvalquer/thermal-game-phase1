import test from 'node:test';
import assert from 'node:assert/strict';
import { VisualQualityManager } from '../../src/rendering/VisualQualityManager.js';

test('heat haze quality adapts with hysteresis and bounded region counts',()=>{
  const manager=new VisualQualityManager();assert.equal(manager.update(59).maxRegions,24);
  assert.equal(manager.update(49).maxRegions,16);assert.equal(manager.update(45).level,'MEDIUM');
  assert.equal(manager.update(39).maxRegions,8);assert.equal(manager.update(44).level,'LOW');
  assert.equal(manager.update(49).level,'MEDIUM');assert.equal(manager.update(58).level,'MEDIUM');
  assert.equal(manager.update(59).level,'HIGH');assert.equal(manager.update(34).maxRegions,0);
  assert.equal(manager.update(41).level,'OFF');assert.equal(manager.update(43).level,'LOW');
});
