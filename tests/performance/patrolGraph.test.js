import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { Technician } from '../../src/entities/Technician.js';
import { TechnicianSystem } from '../../src/simulation/TechnicianSystem.js';

test('300 racks and 40 technicians share one patrol graph without per-worker full-map reachability',()=>{
  const world=new World(32,24);world.fill('air',25);
  for(let i=0;i<300;i++)world.addEntity(new ServerRack(1+i%30,1+Math.floor(i/30)));
  const system=new TechnicianSystem(world,{budget:0}),workers=[];
  for(let i=0;i<40;i++)workers.push(world.addEntity(new Technician(1+i%20,14+Math.floor(i/20))));
  system.reachableCells=()=>{throw new Error('patrol selection must not run a full per-worker reachability search');};
  for(const worker of workers)system.choosePatrol(worker);
  assert.equal(system.patrolGraph.rebuildCount,1);
  world.setMaterial(15,0,'concrete');system.choosePatrol(workers[0]);
  assert.equal(system.patrolGraph.rebuildCount,2);
});
