import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Fan } from '../../src/entities/Fan.js';
import { EnergySystem } from '../../src/simulation/EnergySystem.js';

test('waste heat is applied every physics step while energy balance scans are throttled',()=>{
  const world=new World(8,8),fan=world.addEntity(new Fan(2,2)),metrics={generatedHeat:0,externalEnergy:0,powerEnergy:0,energyBalance:0};
  fan.power=100;fan.wasteHeatFraction=.2;world.indexPowerEquipment(fan);
  const system=new EnergySystem(world,metrics);system.initialize();
  for(let i=0;i<4;i++)system.update(.05);
  assert.equal(metrics.generatedHeat,4);
  assert.equal(metrics.energyBalance,0,'balance has not performed its quarter-second diagnostic scan yet');
  system.update(.05);
  assert.equal(metrics.generatedHeat,5);
  assert.ok(Math.abs(metrics.energyBalance)<1e-8);
});
