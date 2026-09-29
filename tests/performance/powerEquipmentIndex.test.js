import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Pump } from '../../src/entities/Pump.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SolarPanel } from '../../src/entities/SolarPanel.js';
import { powerEquipment } from '../../src/simulation/PowerState.js';

test('power equipment queries reuse the indexed set across entity and utility lifecycle changes',()=>{
  const world=new World(10,8),pump=world.addEntity(new Pump(2,2)),solar=world.addEntity(new SolarPanel(4,2)),duct=new AirDuct(3,2);duct.power=20;world.addUtility(duct);
  const index=powerEquipment(world);
  assert.strictEqual(powerEquipment(world),index,'queries return the same set');
  assert.deepEqual(new Set(index),new Set([pump,solar,duct]));
  assert.equal(world.powerEquipmentSetByType('pump').has(pump),true);
  assert.equal(world.powerEquipmentSetByType('duct').has(duct),true);
  assert.equal(world.powerEquipmentSetByType('solarPanel').has(solar),true);
  world.removeEntity(pump);assert.equal(index.has(pump),false);assert.equal(index.has(duct),true);
  world.clearEntities();assert.equal(index.size,1,'clearing entities preserves powered utilities');
  world.clearUtilities();assert.equal(index.size,0);
});
