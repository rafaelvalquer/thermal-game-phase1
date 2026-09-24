import test from 'node:test';
import assert from 'node:assert/strict';
import { runScenario } from '../../scripts/level01-airflow-scenario.js';

test('level 1 is winnable with four fans and two exhausts at original loads',()=>{
  const {world,simulation,temperatures,maxMachineTemp,consecutiveSafeSeconds}=runScenario();
  assert.equal(simulation.mission.state,'won',JSON.stringify(temperatures));
  assert.ok(temperatures.every(t=>t<40));
  assert.ok(maxMachineTemp<40);
  assert.ok(consecutiveSafeSeconds>=300);
  assert.equal(world.entities.filter(e=>e.isHeatMachine).reduce((sum,e)=>sum+e.heatOutput,0),35000);
  assert.equal(simulation.metrics.powerDraw,2200);
  assert.ok(simulation.metrics.exhaustRejectedPower>5000);
  assert.ok(simulation.metrics.externalRejectedPower>20000);
  assert.ok(simulation.metrics.machineCoolingPower>25000);
  assert.ok(simulation.metrics.maxAirTemp<50);
  assert.ok(world.airDiagnostics.averageFanOperatingPoint>=.65);
  assert.ok(Math.abs(simulation.metrics.energyBalance)<.01);
});

test('a poorly positioned single fan without exhaust cannot win level 1',()=>{
  const {simulation,temperatures}=runScenario('bad');
  assert.notEqual(simulation.mission.state,'won');
  assert.ok(temperatures.some(t=>t>40));
  assert.ok(Math.abs(simulation.metrics.energyBalance)<.01);
});

test('four scattered fans without exhaust cannot win level 1',()=>{
  const {simulation,temperatures}=runScenario('scattered');
  assert.notEqual(simulation.mission.state,'won');
  assert.ok(temperatures.some(t=>t>40));
  assert.ok(Math.abs(simulation.metrics.energyBalance)<.01);
});
