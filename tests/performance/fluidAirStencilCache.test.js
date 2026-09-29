import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { FluidAirStencilCache } from '../../src/simulation/fluid/FluidAirStencilCache.js';

test('exchanger and radiator geometry is reused until air topology changes',()=>{
  const world=new World(7,7),cache=new FluidAirStencilCache(world);
  const exchanger={id:'hx',x:3,y:3},radiator={id:'rad',x:1,y:1};
  const hx=cache.exchangerCells(exchanger),rad=cache.radiatorStencil(radiator);
  assert.equal(cache.exchangerCells(exchanger),hx);assert.equal(cache.radiatorStencil(radiator),rad);assert.equal(cache.buildCount,2);
  world.setMaterial(3,2,'concrete');
  const refreshed=cache.exchangerCells(exchanger);assert.notEqual(refreshed,hx);assert.equal(cache.buildCount,3);
  assert.ok(refreshed.every(cell=>cell.index!==world.index(3,2)));
});

test('air stencil cache detects an equipment position change',()=>{
  const cache=new FluidAirStencilCache(new World(5,5)),radiator={id:'rad',x:1,y:1};
  const first=cache.radiatorStencil(radiator);radiator.x=3;
  const moved=cache.radiatorStencil(radiator);assert.notEqual(moved,first);assert.notEqual(moved.cells[0].index,first.cells[0].index);
});
