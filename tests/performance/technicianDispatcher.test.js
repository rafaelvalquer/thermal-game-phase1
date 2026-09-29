import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { Technician } from '../../src/entities/Technician.js';
import { TechnicianSystem } from '../../src/simulation/TechnicianSystem.js';

test('dispatcher assigns unique hot-rack jobs at most once per second in a large room',()=>{
  const world=new World(100,60);world.fill('air',25);
  for(let index=0;index<200;index++){
    const x=3+(index%20)*4,y=3+Math.floor(index/20)*5;
    world.addEntity(new ServerRack(x,y,{temperature:45+index%20,slaTemperature:35,currentPowerKW:12}));
  }
  const system=new TechnicianSystem(world,{budget:0});system.dispatcher.maxPathAttempts=16;
  for(let index=0;index<30;index++)world.addEntity(new Technician(2+(index%10)*9,54-Math.floor(index/10)*2));
  for(let tick=0;tick<10;tick++)system.update(.1);
  assert.equal(system.dispatcher.dispatchCount,1);
  const assigned=system.workers.map(worker=>worker.targetRackId).filter(id=>id!=null);
  assert.ok(assigned.length>0);assert.equal(new Set(assigned).size,assigned.length,'each rack can have only one technician assigned');
  for(let tick=0;tick<9;tick++)system.update(.1);
  assert.equal(system.dispatcher.dispatchCount,1,'no repeated dispatch within the same second');
  system.update(.1);assert.equal(system.dispatcher.dispatchCount,2);
});
