import test from 'node:test';
import assert from 'node:assert/strict';
import { DataCenterManager } from '../../src/datacenter/DataCenterManager.js';

test('construction saves debounce for two seconds and periodic autosave remains at fifteen seconds',()=>{
  const manager={saveTimer:0,saveDirty:false,saveDebounceRemaining:0,saves:0,markSaveDirty:DataCenterManager.prototype.markSaveDirty,updateAutoSave:DataCenterManager.prototype.updateAutoSave,persist(){this.saves++;this.saveTimer=0;this.saveDirty=false;this.saveDebounceRemaining=0;return true;}};
  manager.markSaveDirty();manager.updateAutoSave(1);assert.equal(manager.saves,0);
  manager.markSaveDirty();manager.updateAutoSave(1.9);assert.equal(manager.saves,0);
  manager.updateAutoSave(.1);assert.equal(manager.saves,1);assert.equal(manager.saveDirty,false);
  manager.updateAutoSave(14.9);assert.equal(manager.saves,1);manager.updateAutoSave(.1);assert.equal(manager.saves,2);
});
