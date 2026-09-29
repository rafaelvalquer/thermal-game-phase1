import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { CoolingSystem } from '../../src/simulation/cooling/CoolingSystem.js';

test('cooling runtime indexes keep path references stable across steady updates',()=>{
  const world=new World(10,7),unit=world.addEntity(new CoolingUnit(1,2));
  world.addUtility(new AirDuct(2,2));const vent=world.addEntity(new SupplyVent(3,2));
  const metrics={},cooling=new CoolingSystem(world,new AirflowSystem(world,metrics),metrics);
  cooling.update(.05);const network=cooling.networkByVentId.get(vent.id),path=cooling.pathsByUnitId.get(unit.id)[0];
  assert.equal(cooling.networksByUnitId.get(unit.id)[0],network);
  assert.equal(cooling.pathsByNetworkUnitId.get(cooling.networkUnitKey(network,unit))[0],path);
  assert.equal(cooling.pathsByVentId.get(vent.id)[0],path);
  cooling.update(.05);
  assert.equal(cooling.pathsByUnitId.get(unit.id)[0],path);
  assert.ok(path.flowRate>0);
});

test('return-air stencil is reused and rebuilt after air topology changes',()=>{
  const world=new World(7,7),unit=world.addEntity(new CoolingUnit(1,2));
  world.addUtility(new AirDuct(2,2));const vent=world.addEntity(new SupplyVent(3,2));
  const metrics={},cooling=new CoolingSystem(world,new AirflowSystem(world,metrics),metrics);cooling.update(.05);
  const stencil=cooling.exchange.coverage.get(vent).returnAirStencil;
  assert.ok(stencil.length>0);assert.equal(cooling.exchange.coverage.get(vent).returnAirStencil,stencil);
  world.setMaterial(2,1,'concrete');
  const updated=cooling.exchange.coverage.get(vent).returnAirStencil;
  assert.notEqual(updated,stencil);
  assert.ok(!updated.some(cell=>cell.index===world.index(2,1)));
});

test('cooling distribution control runs at 10 Hz and preserves airflow between refreshes',()=>{
  const world=new World(10,7),unit=world.addEntity(new CoolingUnit(1,2));
  world.addUtility(new AirDuct(2,2));const vent=world.addEntity(new SupplyVent(3,2));
  const metrics={},cooling=new CoolingSystem(world,new AirflowSystem(world,metrics),metrics);let updates=0;
  const refresh=cooling.refreshDistribution.bind(cooling);cooling.refreshDistribution=(...args)=>{updates++;return refresh(...args);};
  for(let i=0;i<10;i++)cooling.update(.05);
  assert.ok(updates>=5&&updates<=6,`expected about 5 control updates, got ${updates}`);
  const flow=vent.flowRate;cooling.update(.05);assert.equal(vent.flowRate,flow,'previous flow is held between control updates');
  cooling.update(.05);assert.ok(updates>=6);
  assert.ok(unit.currentAirFlow>=0);
});

test('cooling topology indexes and path objects stay stable through 1000 steady ticks',()=>{
  const world=new World(10,7),unit=world.addEntity(new CoolingUnit(1,2));
  world.addUtility(new AirDuct(2,2));const vent=world.addEntity(new SupplyVent(3,2));
  const metrics={},cooling=new CoolingSystem(world,new AirflowSystem(world,metrics),metrics);
  let builds=0;const build=cooling.builder.build.bind(cooling.builder);cooling.builder.build=(...args)=>{builds++;return build(...args);};
  cooling.update(.05);
  const indexes=[cooling.networksByUnitId,cooling.pathsByUnitId,cooling.pathsByVentId,cooling.networkByVentId];
  const paths=cooling.pathsByUnitId.get(unit.id),path=paths[0],duct=path.path[0],direction=duct.direction,plan=[...cooling.ventPlans.values()][0],contribution=plan?.contributions[0],exchange=cooling.pendingExchange[0],topologyVersion=world.utilityTopologyVersion;
  const reusable=[cooling.ventPlans,cooling.ventPlanPool,cooling.plannedByUnit,cooling.previewRuntime,cooling.pendingExchange,cooling.pendingExchangePool,plan?.contributions];
  for(let tick=0;tick<1000;tick++)cooling.update(.05);
  assert.equal(builds,1);assert.equal(world.utilityTopologyVersion,topologyVersion);
  assert.equal(cooling.networksByUnitId,indexes[0]);assert.equal(cooling.pathsByUnitId,indexes[1]);
  assert.equal(cooling.pathsByVentId,indexes[2]);assert.equal(cooling.networkByVentId,indexes[3]);
  assert.equal(cooling.pathsByUnitId.get(unit.id),paths);assert.equal(cooling.pathsByVentId.get(vent.id)[0],path);
  assert.deepEqual([cooling.ventPlans,cooling.ventPlanPool,cooling.plannedByUnit,cooling.previewRuntime,cooling.pendingExchange,cooling.pendingExchangePool,plan?.contributions],reusable);
  assert.equal(duct.direction,direction);assert.equal(plan.contributions[0],contribution);assert.equal(cooling.pendingExchange[0],exchange);
});
