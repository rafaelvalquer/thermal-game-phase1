import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirflowSystem } from '../../src/simulation/air/AirflowSystem.js';
import { CoolingSystem } from '../../src/simulation/cooling/CoolingSystem.js';

test('cooling topology is reused across ticks and rebuilt after a duct is added',()=>{
  const world=new World(24,12),metrics={},monitor={count(){this.rebuilds=(this.rebuilds||0)+1;}},airflow=new AirflowSystem(world,metrics),cooling=new CoolingSystem(world,airflow,metrics);
  cooling.monitor=monitor;world.addEntity(new CoolingUnit(2,2));world.addUtility(new AirDuct(3,2,{size:'duct'}));world.addEntity(new SupplyVent(4,2));
  let builds=0;const build=cooling.builder.build.bind(cooling.builder);cooling.builder.build=()=>{builds++;return build();};
  for(let i=0;i<100;i++)cooling.update(.05);
  assert.equal(builds,1);assert.equal(monitor.rebuilds,1);
  world.addUtility(new AirDuct(5,2,{size:'duct'}));cooling.update(.05);
  assert.equal(builds,2);assert.equal(monitor.rebuilds,2);
});
