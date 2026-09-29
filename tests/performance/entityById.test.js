import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { AirDuct } from '../../src/entities/AirDuct.js';

test('world ID lookup tracks entities and utilities through add, remove, and restore-style clearing',()=>{
  const world=new World(8,6),rack=world.addEntity(new ServerRack(1,1)),duct=world.addUtility(new AirDuct(2,1));
  assert.equal(world.getEntityById(rack.id),rack);assert.equal(world.getEntityById(duct.id),duct);
  assert.ok(world.utilitySetByType('duct').has(duct));
  world.removeEntity(rack);world.removeUtility(duct);
  assert.equal(world.getEntityById(rack.id),null);assert.equal(world.getEntityById(duct.id),null);
  const second=world.addEntity(new ServerRack(3,1)),secondDuct=world.addUtility(new AirDuct(4,1));
  world.clearEntities();assert.equal(world.getEntityById(second.id),null);assert.equal(world.getEntityById(secondDuct.id),secondDuct);
  world.clearUtilities();assert.equal(world.getEntityById(secondDuct.id),null);assert.equal(world.utilitySetByType('duct').size,0);
});
