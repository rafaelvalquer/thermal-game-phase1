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

test('higher free-flow exhaust rejects more heat at the same nominal electrical power',()=>{
  const run=freeFlow=>{
    const {world,exhaust,metrics,system}=setup();exhaust.qFree=freeFlow;
    for(let i=0;i<200;i++)system.updateVelocity(.05);
    for(let y=3;y<11;y++)for(let x=3;x<11;x++)world.setTemperature(x,y,45);
    system.applyExhaust(.05);
    return {flow:exhaust.currentFlow,rejected:exhaust.heatRejectedPower,power:exhaust.power,exported:metrics.externalEnergy};
  };
  const baseline=run(3.2),improved=run(4);
  assert.equal(improved.power,baseline.power);
  assert.ok(improved.flow>baseline.flow);
  assert.ok(improved.rejected>baseline.rejected);
  assert.ok(improved.rejected<=1.225*improved.flow*1005*45+1e-6,'rejection stays within measured-flow heat capacity');
});

test('internal exhaust uses an implicit outdoor duct and exports captured heat',()=>{
  const {world,exhaust,metrics,system}=setup(6,6);
  for(let i=0;i<120;i++)system.updateVelocity(.05);
  for(const cell of system.capture.cells(exhaust))world.setTemperature(cell.x,cell.y,60);
  const before=world.totalTileEnergy();
  system.applyExhaust(.05);
  assert.equal(exhaust.status,'READY');assert.ok(metrics.externalEnergy>0);
  assert.ok(exhaust.heatRejectedPower>0);
  assert.ok(Math.abs(before-world.totalTileEnergy()-metrics.externalEnergy)<1e-6);
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

test('exhaust capture forms a four-tile funnel that widens away from the outlet and rotates with it',()=>{
  const {exhaust,system}=setup(),capture=system.capture.cells(exhaust);
  assert.equal(exhaust.captureRadius,4);
  assert.ok(capture.some(cell=>cell.x===6&&cell.y===4),'the wide end reaches farther off-axis');
  assert.ok(capture.some(cell=>cell.x===9&&cell.y===5),'the throat captures the nearby intake');
  assert.ok(!capture.some(cell=>cell.x===10&&cell.y===5),'the funnel narrows to the exhaust face');
  assert.ok(capture.every(cell=>cell.x<=exhaust.x),'the exhaust does not capture air downstream of its outlet');
  exhaust.direction={x:0,y:1};
  const rotated=system.capture.cells(exhaust);
  assert.ok(rotated.some(cell=>cell.x===8&&cell.y===3));
  assert.ok(!rotated.some(cell=>cell.x===6&&cell.y===6));
  assert.equal(exhaust.qFree,4);assert.equal(exhaust.power,500);
});

test('exhaust gives hot capture cells more flow share without exceeding its measured-flow heat limit',()=>{
  const {world,exhaust,metrics,system}=setup();
  for(let i=0;i<200;i++)system.updateVelocity(.05);
  const cells=system.capture.cells(exhaust);
  for(const cell of cells)world.setTemperature(cell.x,cell.y,40);
  const hot={x:8,y:6},cool={x:7,y:6};
  assert.ok(cells.some(cell=>cell.x===hot.x&&cell.y===hot.y));
  assert.ok(cells.some(cell=>cell.x===cool.x&&cell.y===cool.y));
  world.setTemperature(hot.x,hot.y,80);world.setTemperature(cool.x,cool.y,30);
  const beforeHot=world.temperatureAt(hot.x,hot.y),beforeCool=world.temperatureAt(cool.x,cool.y),totalBefore=world.totalTileEnergy();
  system.applyExhaust(.05);
  const hotRemoved=(beforeHot-world.temperatureAt(hot.x,hot.y))*world.capacityAtIndex(world.index(hot.x,hot.y));
  const coolRemoved=(beforeCool-world.temperatureAt(cool.x,cool.y))*world.capacityAtIndex(world.index(cool.x,cool.y));
  assert.ok(hotRemoved>coolRemoved,'the hotter cell receives a larger share of exhaust flow');
  assert.ok(metrics.externalEnergy>0);
  assert.ok(metrics.externalEnergy<=1.225*exhaust.currentFlow*1005*55*.05+1e-6,'heat export stays within measured air-flow capacity');
  assert.ok(Math.abs(totalBefore-world.totalTileEnergy()-metrics.externalEnergy)<1e-6,'exported heat matches energy removed from the room');
});

test('virtual outlet passes walls while capture respects obstructions; cold air is not a heat sink',()=>{
  const {world,exhaust,metrics,system}=setup();
  world.setMaterial(11,6,'concrete');system.grid.syncTopology();exhaust.flowEfficiency=.8;
  assert.equal(system.isExhaustConnectedToOutside(exhaust),true);
  system.applyExhaust(.05);assert.equal(exhaust.status,'READY');
  world.setMaterial(11,6,'air');
  for(let y=2;y<12;y++)world.setMaterial(8,y,'concrete');system.grid.syncTopology();
  assert.ok(system.capture.cells(exhaust).every(cell=>cell.x>8),'the solid wall blocks intake capture');
  for(let y=2;y<12;y++)world.setMaterial(8,y,'air');system.grid.syncTopology();
  for(let i=0;i<100;i++)system.updateVelocity(.05);
  for(const c of system.capture.cells(exhaust))world.setTemperature(c.x,c.y,20);
  system.applyExhaust(.05);assert.ok(metrics.externalEnergy<0);
});

test('an outward boundary exhaust has an outlet',()=>{
  const world=new World(8,8),exhaust=world.addEntity(new ExhaustFan(7,4));
  const system=new AirflowSystem(world,{externalEnergy:0});
  assert.equal(system.isExhaustConnectedToOutside(exhaust),true);
});

test('an internal exhaust uses a virtual outlet even between indoor rooms',()=>{
  const world=new World(24,14);
  MapBuilder.apply(world,{rooms:[{x:2,y:2,w:10,h:10},{x:11,y:2,w:10,h:10}],openings:[{x:11,y:6,w:1,h:1}]});
  const exhaust=world.addEntity(new ExhaustFan(10,6)),system=new AirflowSystem(world,{externalEnergy:0});
  assert.equal(system.isExhaustConnectedToOutside(exhaust),true);
});
