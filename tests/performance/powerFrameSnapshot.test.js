import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { Pump } from '../../src/entities/Pump.js';
import { SolarPanel } from '../../src/entities/SolarPanel.js';
import { BatteryDispatchSystem } from '../../src/simulation/BatteryDispatchSystem.js';
import { PowerGridSystem } from '../../src/datacenter/PowerGridSystem.js';

test('power frame snapshot centralizes loads, solar generation, and grid power',()=>{
  const world=new World(12,8),metrics={generatedHeat:0};world.solarHour=12;
  const rack=world.addEntity(new ServerRack(2,2)),cooling=world.addEntity(new CoolingUnit(4,2)),pump=world.addEntity(new Pump(6,2)),solar=world.addEntity(new SolarPanel(8,2));
  rack.requestedPower=12000;cooling.requestedPower=3000;pump.requestedPower=500;
  const dispatch=new BatteryDispatchSystem(world,metrics);world.batteryDispatch=dispatch;
  dispatch.dispatch(10000,.05);
  const snapshot=dispatch.snapshot;
  assert.equal(snapshot.rackPowerW,12000);assert.equal(snapshot.coolingPowerW,3000);assert.equal(snapshot.fluidPowerW,500);
  assert.equal(snapshot.solarGenerationW,solar.peakPowerW);assert.equal(snapshot.grossLoadW,15500);
  assert.equal(snapshot.gridPowerW,13500);assert.equal(snapshot.overloaded,true);assert.equal(snapshot.reserveW,-3500);
  const grid=new PowerGridSystem({capacityKW:10});grid.refresh(world);
  assert.equal(grid.demandKW,13.5);assert.equal(grid.effectiveKW,13.5);
  assert.strictEqual(dispatch.snapshot,snapshot,'all consumers read the same frame object');
});
