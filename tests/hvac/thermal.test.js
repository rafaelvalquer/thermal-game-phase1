import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { DuctThermalSolver } from '../../src/simulation/hvac/DuctThermalSolver.js';

test('insulated embedded duct retains supply temperature better than uninsulated duct',()=>{
  const worldA=new World(3,3),worldB=new World(3,3);
  worldA.setMaterial(1,1,'concrete');worldB.setMaterial(1,1,'concrete');worldA.setTemperature(1,1,40);worldB.setTemperature(1,1,40);
  const plain=new AirDuct(1,1,{embedded:true}),insulated=new AirDuct(1,1,{embedded:true,insulated:true});
  const solverA=new DuctThermalSolver(worldA),solverB=new DuctThermalSolver(worldB);
  const outA=solverA.transfer(plain,14,1,.1),outB=solverB.transfer(insulated,14,1,.1);
  assert.ok(outB<outA);assert.ok(outB>14);assert.ok(worldA.energy[worldA.index(1,1)]<worldB.energy[worldB.index(1,1)]);
});

test('duct heat exchange conserves wall plus transported-air energy',()=>{
  const world=new World(3,3);world.setMaterial(1,1,'concrete');world.setTemperature(1,1,40);
  const duct=new AirDuct(1,1,{embedded:true}),solver=new DuctThermalSolver(world),before=world.energy[world.index(1,1)];
  const flow=.5,dt=.1,inlet=14,outlet=solver.transfer(duct,inlet,flow,dt);
  const airEnergyChange=flow*1.225*1005*(outlet-inlet)*dt;
  const wallEnergyChange=world.energy[world.index(1,1)]-before;
  assert.ok(Math.abs(airEnergyChange+wallEnergyChange)<1e-6);
});
