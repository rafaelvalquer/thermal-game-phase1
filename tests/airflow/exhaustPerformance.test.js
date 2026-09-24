import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ExhaustFan } from '../../src/entities/ExhaustFan.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { MapBuilder } from '../../src/campaign/MapBuilder.js';

function setup(x=10,y=6){
  const world=new World(16,14);
  MapBuilder.apply(world,{rooms:[{x:2,y:2,w:10,h:10}],openings:[{x:11,y:5,w:1,h:3},{x:2,y:5,w:1,h:3}]});
  const exhaust=world.addEntity(new ExhaustFan(x,y));
  const metrics={externalEnergy:0},system=new AirflowSystem(world,metrics);
  return {world,exhaust,metrics,system};
}

test('connected exhaust exports measured sensible heat and conserves energy',()=>{
  const {world,exhaust,metrics,system}=setup();
  for(let i=0;i<200;i++)system.updateVelocity(.05);
  for(let y=3;y<11;y++)for(let x=3;x<11;x++)world.setTemperature(x,y,45);
  const before=world.totalTileEnergy();system.applyExhaust(.05);
  assert.equal(exhaust.status,'READY');
  assert.ok(exhaust.currentFlow>exhaust.qFree*.65);
  assert.ok(exhaust.heatRejectedPower>10000);
  assert.ok(Math.abs(before-world.totalTileEnergy()-metrics.externalEnergy)<1e-6);
  exhaust.enabled=false;const exported=metrics.externalEnergy;
  system.applyExhaust(.05);assert.equal(metrics.externalEnergy,exported);
});

test('internal exhaust has NO OUTLET and exports no heat',()=>{
  const {world,exhaust,metrics,system}=setup(6,6);
  world.setTemperature(6,6,60);
  for(let i=0;i<120;i++)system.updateVelocity(.05);
  system.applyExhaust(.05);
  assert.equal(exhaust.status,'NO OUTLET');assert.equal(metrics.externalEnergy,0);
});

test('capture pulls toward the inlet and cannot cross walls or corners',()=>{
  const {world,exhaust,system}=setup();
  world.setTemperature(8,7,70);
  system.capture.apply(.05);
  const v=system.grid.cellVelocity(8,7);
  assert.ok(v.x>0&&v.y<0,JSON.stringify(v));
  for(let y=2;y<12;y++)world.setMaterial(9,y,'concrete');
  system.grid.syncTopology();system.capture.apply(.05);
  assert.deepEqual(system.grid.cellVelocity(8,7),{x:0,y:0});
  assert.ok(!system.capture.cells(exhaust).some(c=>c.x<9));
});

test('blocked and reversed outlets cannot export heat; cold air is not a heat sink',()=>{
  const {world,exhaust,metrics,system}=setup();
  exhaust.direction={x:-1,y:0};system.applyExhaust(.05);
  assert.equal(exhaust.status,'NO OUTLET');
  exhaust.direction={x:1,y:0};world.setMaterial(11,6,'concrete');system.grid.syncTopology();system.applyExhaust(.05);
  assert.equal(exhaust.status,'BLOCKED');assert.equal(metrics.externalEnergy,0);
  world.setMaterial(11,6,'air');system.grid.syncTopology();
  for(let i=0;i<100;i++)system.updateVelocity(.05);
  for(const c of system.capture.cells(exhaust))world.setTemperature(c.x,c.y,20);
  system.applyExhaust(.05);assert.ok(metrics.externalEnergy<0);
});

test('an outward boundary exhaust has an outlet',()=>{
  const world=new World(8,8),exhaust=world.addEntity(new ExhaustFan(7,4));
  const system=new AirflowSystem(world,{externalEnergy:0});
  assert.equal(system.isExhaustConnectedToOutside(exhaust),true);
});

test('an opening into another indoor room is not an exterior outlet',()=>{
  const world=new World(24,14);
  MapBuilder.apply(world,{rooms:[{x:2,y:2,w:10,h:10},{x:11,y:2,w:10,h:10}],openings:[{x:11,y:6,w:1,h:1}]});
  const exhaust=world.addEntity(new ExhaustFan(10,6)),system=new AirflowSystem(world,{externalEnergy:0});
  assert.equal(system.isExhaustConnectedToOutside(exhaust),false);
});
