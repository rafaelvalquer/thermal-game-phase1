import test from 'node:test';
import assert from 'node:assert/strict';
import { UIScheduler } from '../../src/ui/UIScheduler.js';
import { UIManager } from '../../src/ui/UIManager.js';

test('UI frequencies are scheduled independently and immediate invalidation is supported',()=>{
  const scheduler=new UIScheduler({inspector:.1,metrics:.2,graphs:.5});
  assert.deepEqual(scheduler.update(.09),[]);
  assert.deepEqual(scheduler.update(.02),['inspector']);
  assert.deepEqual(scheduler.update(.1),['inspector','metrics']);
  scheduler.flush('graphs');assert.deepEqual(scheduler.update(0),['graphs']);
});

test('immediate data-center and new critical alerts bypass the UI refresh intervals',()=>{
  const ui=Object.create(UIManager.prototype);ui.forceUiRefresh=new Set();ui.activeDue=new Set();
  ui.forceDatacenterUiRefresh();assert.ok(ui.activeDue.has('metrics'));assert.ok(ui.activeDue.has('datacenterDashboard'));assert.ok(ui.activeDue.has('graphs'));
  ui.game={sim:{metrics:{maxAirTemp:81,maxMachineTemp:25,powerDraw:0}},level:{powerLimit:1000},datacenter:null};
  assert.equal(ui.criticalAlertSignature(),'air');
  ui.game.sim.metrics.maxAirTemp=25;assert.equal(ui.criticalAlertSignature(),'');
});
