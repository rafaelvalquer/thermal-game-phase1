import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { HeatExchanger } from '../../src/entities/HeatExchanger.js';
import { Machine } from '../../src/entities/Machine.js';
import { FluidSystem } from '../../src/simulation/FluidSystem.js';

test('exchanger adjacency candidates are cached and invalidated by heat-machine topology',()=>{
  const world=new World(7,7),exchanger=world.addEntity(new HeatExchanger(3,3)),north=world.addEntity(new Machine(3,2)),system=new FluidSystem(world,{});
  const first=system.exchangerTargets.adjacentMachines(exchanger);
  assert.deepEqual(first,[north]);assert.equal(system.exchangerTargets.adjacentMachines(exchanger),first);assert.equal(system.exchangerTargets.rebuildCount,1);
  const west=world.addEntity(new Machine(2,3));const refreshed=system.exchangerTargets.adjacentMachines(exchanger);
  assert.notEqual(refreshed,first);assert.deepEqual(new Set(refreshed),new Set([north,west]));
  world.removeEntity(west);assert.deepEqual(system.exchangerTargets.adjacentMachines(exchanger),[north]);
});
