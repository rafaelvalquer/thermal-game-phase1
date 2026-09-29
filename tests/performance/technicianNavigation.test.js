import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { Technician } from '../../src/entities/Technician.js';
import { NavigationGrid } from '../../src/simulation/staff/NavigationGrid.js';

test('navigation uses cached static walkability and O(1) technician occupancy',()=>{
  const world=new World(12,8),navigation=new NavigationGrid(world),worker=world.addEntity(new Technician(2,2));
  assert.equal(navigation.isWalkable(2,2),false);
  assert.equal(navigation.isWalkable(2,2,worker),true);
  const built=navigation.rebuildCount,version=navigation.version;
  world.moveEntity(worker,3,2);
  assert.equal(navigation.isWalkable(2,2),true);assert.equal(navigation.isWalkable(3,2),false);
  assert.equal(navigation.rebuildCount,built,'technician motion does not rebuild static walkability');
  world.addEntity(new ServerRack(6,4));
  assert.equal(navigation.isWalkable(6,4),false);assert.equal(navigation.version,version+1);
  world.setMaterial(5,4,'concrete');assert.equal(navigation.isWalkable(5,4),false);assert.equal(navigation.version,version+2);
});
