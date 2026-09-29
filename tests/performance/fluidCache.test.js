import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Pipe } from '../../src/entities/Pipe.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { FluidSystem } from '../../src/simulation/FluidSystem.js';

test('fluid networks are reused until a pipe or fluid component changes',()=>{
  const world=new World(12,8),fluid=new FluidSystem(world,{});let builds=0;
  const build=fluid.buildNetworks.bind(fluid);fluid.buildNetworks=()=>{builds++;return build();};
  for(let tick=0;tick<100;tick++)fluid.update(.05);
  assert.equal(builds,1);
  world.addEntity(new ServerRack(1,1));fluid.update(.05);assert.equal(builds,1);
  world.addEntity(new Pipe(2,2));fluid.update(.05);assert.equal(builds,2);
  world.removeEntity(world.entityAt(2,2));fluid.update(.05);assert.equal(builds,3);
});
