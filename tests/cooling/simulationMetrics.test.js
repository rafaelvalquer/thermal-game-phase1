import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Machine } from '../../src/entities/Machine.js';
import { Simulation } from '../../src/simulation/Simulation.js';

test('simulation reports maximum air and machine temperatures independently and keeps the aggregate maximum',()=>{
  const world=new World(4,4),machine=world.addEntity(new Machine(1,1,{temperature:82}));
  world.setTemperature(2,2,65);
  const simulation=Object.create(Simulation.prototype);
  simulation.world=world;
  simulation.metrics={maxTempEver:25,maxPowerEver:0,powerDraw:0};
  simulation.updateMetrics();
  assert.equal(simulation.metrics.maxAirTemp,65);
  assert.equal(simulation.metrics.maxMachineTemp,machine.temperature);
  assert.equal(simulation.metrics.maxTemp,82);
});
