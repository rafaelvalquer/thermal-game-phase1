import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirflowSystem } from '../../src/simulation/air/AirflowSystem.js';
import { CoolingSystem } from '../../src/simulation/cooling/CoolingSystem.js';

test('power protection prepares one cooling frame and reuses it when no unit is blocked',()=>{
  const world=new World(24,12),metrics={},airflow=new AirflowSystem(world,metrics),cooling=new CoolingSystem(world,airflow,metrics);
  world.addEntity(new CoolingUnit(2,2));world.addUtility(new AirDuct(3,2,{size:'duct'}));world.addUtility(new AirDuct(4,2,{size:'duct'}));world.addEntity(new SupplyVent(5,2));
  let demands=0;const coolingDemand=cooling.exchange.coolingDemand.bind(cooling.exchange);
  cooling.exchange.coolingDemand=vent=>{demands++;return coolingDemand(vent);};

  const plan=cooling.prepareFrame(.05);
  assert.ok(plan);assert.equal(plan.units.length,1);assert.ok(Array.isArray(plan.units[0].branches));assert.equal(plan.vents.length,1);
  const preparedDemandCalls=demands,pendingCount=plan.pendingExchange.length;
  assert.equal(cooling.applyPowerResult(.05),true);
  assert.equal(demands,preparedDemandCalls,'the applied frame does not redistribute cooling or recalculate vent demand');
  assert.equal(cooling.pendingExchange.length,pendingCount,'the prepared heat-exchange work is handed off intact');
});

test('cooling frame plan is discarded after topology or power-state changes',()=>{
  const world=new World(20,10),airflow=new AirflowSystem(world,{}),cooling=new CoolingSystem(world,airflow,{});
  const unit=world.addEntity(new CoolingUnit(2,2));world.addUtility(new AirDuct(3,2,{size:'duct'}));world.addEntity(new SupplyVent(4,2));
  cooling.prepareFrame(.05);world.addUtility(new AirDuct(5,2,{size:'duct'}));
  assert.equal(cooling.applyPowerResult(.05),false,'changed topology requires a fresh frame');
  cooling.prepareFrame(.05);unit.powerBlocked=true;
  assert.equal(cooling.applyPowerResult(.05),false,'changed power result requires a fresh frame');
});

test('a protection cut recalculates only units in the affected cooling network',()=>{
  const world=new World(32,12),airflow=new AirflowSystem(world,{}),cooling=new CoolingSystem(world,airflow,{});world.datacenter={};
  const first=world.addEntity(new CoolingUnit(1,2)),second=world.addEntity(new CoolingUnit(1,7));
  for(const y of [2,7]){world.addUtility(new AirDuct(2,y,{size:'duct'}));world.addUtility(new AirDuct(3,y,{size:'duct'}));world.addEntity(new SupplyVent(4,y));}
  cooling.prepareFrame(.05);let solves=0;const solve=cooling.performance.solve.bind(cooling.performance);cooling.performance.solve=(...args)=>{solves++;return solve(...args);};
  const unchangedFlow=second.currentAirFlow;first.powerBlocked=true;
  assert.equal(cooling.applyPowerResult(.05),false,'the prepared plan is partially refreshed after the breaker result');
  assert.equal(solves,1,'only the unit connected to the changed network should be recalculated');
  assert.equal(second.currentAirFlow,unchangedFlow,'an independent cooling network keeps its prepared result');
});
