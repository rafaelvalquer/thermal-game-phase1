import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { MapBuilder } from '../../src/campaign/MapBuilder.js';

test('upwind transport follows velocity and exports boundary enthalpy without accumulation',()=>{
  const world=new World(20,5),metrics={externalEnergy:0},air=new AirflowSystem(world,metrics);
  air.grid.u.fill(2);world.setTemperature(4,2,60);
  const before=world.totalTileEnergy();
  for(let i=0;i<100;i++)air.advectHeat(.05);
  assert.equal(world.temperatureAt(3,2),25);
  assert.ok(metrics.externalEnergy>0);
  assert.ok(Math.abs(before-world.totalTileEnergy()-metrics.externalEnergy)<1e-6);
  for(let i=0;i<world.size;i++)assert.ok(world.temperatureAtIndex(i)>=25-1e-8&&world.temperatureAtIndex(i)<=60+1e-8);
});

test('CFL substeps keep high-speed hot and cold transport bounded and conservative',()=>{
  const world=new World(12,6),metrics={externalEnergy:0},air=new AirflowSystem(world,metrics);
  air.grid.u.fill(14);world.setTemperature(2,2,70);world.setTemperature(2,3,10);
  const before=world.totalTileEnergy();
  air.advectHeat(.5);
  for(let i=0;i<world.size;i++)assert.ok(world.temperatureAtIndex(i)>=10-1e-8&&world.temperatureAtIndex(i)<=70+1e-8);
  assert.ok(Math.abs(before-world.totalTileEnergy()-metrics.externalEnergy)<1e-6);
});

test('CPD exterior doors expel hot air while interior doors do not count as outdoor outlets',()=>{
  const world=new World(12,9),metrics={externalEnergy:0};
  MapBuilder.apply(world,{rooms:[{x:2,y:2,w:8,h:5}],openings:[{x:2,y:4,w:1,h:1},{x:5,y:4,w:1,h:1}]});
  assert.deepEqual(world.airExteriorOpenings.map(({x,y,direction})=>({x,y,direction})),[{x:2,y:4,direction:{x:-1,y:0}}]);
  const air=new AirflowSystem(world,metrics),door={x:2,y:4};
  world.setTemperature(door.x,door.y,60);
  air.grid.u[air.grid.uIndex(door.x,door.y)]=-1;
  const before=world.totalTileEnergy();air.advectHeat(.1);
  assert.ok(metrics.externalEnergy>0,'hot outward flow exports heat through the exterior door');
  assert.ok(Math.abs(before-world.totalTileEnergy()-metrics.externalEnergy)<1e-6);
  assert.equal(world.temperatureAt(1,4),25,'exported hot air is not deposited outside the room');
});
