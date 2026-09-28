import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { CoolingSystem } from '../../src/simulation/cooling/CoolingSystem.js';
import { PlacementValidator } from '../../src/building/PlacementValidator.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';

test('three units own independent full-capacity networks and add cooling in one room',()=>{
  const world=new World(12,8),room={id:'shared-room',x:3,y:0,width:9,height:8};
  world.zones=[room];
  for(let y=0;y<8;y++)for(let x=3;x<12;x++)world.setTemperature(x,y,32);

  const units=[];
  for(const y of [1,3,5]){
    const unit=new CoolingUnit(0,y);unit.missionId=`ac-${y}`;world.addEntity(unit);
    world.addUtility(new AirDuct(1,y,{size:'duct'}));
    world.addUtility(new AirDuct(2,y,{size:'duct'}));
    world.addEntity(new SupplyVent(3,y));units.push(unit);
  }
  units[2].enabled=false;
  const metrics={generatedHeat:0,externalEnergy:0},airflow=new AirflowSystem(world,metrics);
  const cooling=new CoolingSystem(world,airflow,metrics);

  cooling.update(1);
  airflow.updateVelocity(1);
  cooling.exchangeRooms(1);

  assert.equal(cooling.networks.length,3);
  assert.ok(cooling.networks.every(network=>network.status==='READY'));
  assert.deepEqual(units.map(unit=>unit.availableCapacity),[25000,25000,0]);
  assert.ok(units[0].currentAirFlow>0&&units[1].currentAirFlow>0);
  assert.equal(units[2].currentAirFlow,0);
  assert.ok(units[0].currentCooling>0&&units[1].currentCooling>0);
  assert.equal(units[2].currentCooling,0);
  assert.ok(Math.abs(metrics.coolingDelivered-units[0].currentCooling-units[1].currentCooling)<1e-8);
  assert.notEqual(units[0].networkId,units[1].networkId);
  assert.notEqual(units[1].networkId,units[2].networkId);

  world.removeEntity(units[0]);
  const replacement=new CoolingUnit(0,7);replacement.missionId='ac-4';world.addEntity(replacement);
  cooling.update(1);
  assert.equal(units[1].unitLabel,'AC-02');
  assert.equal(units[2].unitLabel,'AC-03');
  assert.equal(replacement.unitLabel,'AC-04');
});

test('shared ducts add unit airflow and deliver cooling once at a common outlet',()=>{
  const world=new World(10,7);world.zones=[{id:'room',x:2,y:2,width:6,height:4}];
  for(let y=0;y<7;y++)for(let x=0;x<10;x++)world.setTemperature(x,y,32);
  const small=new CoolingUnit(1,2,{ratedCoolingCapacity:10000,maxAirFlow:1.2,fanPower:300});
  const large=new CoolingUnit(5,2,{ratedCoolingCapacity:50000,maxAirFlow:5,fanPower:1400});
  const vent=new SupplyVent(3,3);world.addEntity(small);world.addEntity(large);world.addEntity(vent);
  for(const x of [2,3,4])world.addUtility(new AirDuct(x,2,{size:'duct'}));
  const metrics={generatedHeat:0,externalEnergy:0},system=new CoolingSystem(world,new AirflowSystem(world,metrics),metrics);
  system.update(1);
  const network=system.networks[0];
  assert.equal(network.status,'READY');assert.deepEqual(network.sourceUnits,[small,large]);
  assert.equal(network.paths.length,2);
  assert.ok(Math.abs(vent.flowRate-small.currentAirFlow-large.currentAirFlow)<1e-9);
  assert.ok(small.currentAirFlow>0&&large.currentAirFlow>small.currentAirFlow);
  assert.equal(system.pendingExchange.length,1);
  system.exchangeRooms(1);
  assert.ok(small.currentCooling>0&&large.currentCooling>0);
  assert.ok(Math.abs(metrics.coolingDelivered-small.currentCooling-large.currentCooling)<1e-8);
  assert.ok(Math.abs(metrics.coolingDelivered-vent.coolingDelivered)<1e-8);
  assert.ok(Math.abs(metrics.coolingPower-small.electricalPower-large.electricalPower)<1e-8);
  assert.ok(Math.abs(metrics.coolingHeatRejected-small.heatRejected-large.heatRejected)<1e-8);

  small.enabled=false;system.update(1);
  assert.equal(small.currentAirFlow,0);assert.ok(large.currentAirFlow>0);
  assert.ok(Math.abs(vent.flowRate-large.currentAirFlow)<1e-9);
  world.removeEntity(small);system.update(1);
  assert.equal(system.networks[0].status,'READY');assert.deepEqual(system.networks[0].sourceUnits,[large]);
});

test('shared network includes each unit in datacenter power preview and respects power blocks',()=>{
  const world=new World(8,5);world.datacenter={};
  for(let y=0;y<5;y++)for(let x=0;x<8;x++)world.setTemperature(x,y,32);
  const a=new CoolingUnit(1,2),b=new CoolingUnit(5,2),vent=new SupplyVent(3,3);
  world.addEntity(a);world.addEntity(b);world.addEntity(vent);
  for(const x of [2,3,4])world.addUtility(new AirDuct(x,2,{size:'duct'}));
  const metrics={generatedHeat:0,externalEnergy:0},system=new CoolingSystem(world,new AirflowSystem(world,metrics),metrics);
  system.update(1,{prepareOnly:true,ignorePowerBlock:true});
  assert.ok(a.requestedPower>0&&b.requestedPower>0);
  b.powerBlocked=true;system.update(1,{prepareOnly:true});
  assert.ok(a.currentAirFlow>0);assert.equal(b.currentAirFlow,0);assert.equal(b.power,0);
  system.update(1,{prepareOnly:true,ignorePowerBlock:true});
  assert.ok(b.requestedPower>0);
});

test('a unit cannot be placed against two disconnected duct components',()=>{
  const world=new World(8,5);
  world.addUtility(new AirDuct(2,2,{size:'duct'}));world.addUtility(new AirDuct(4,2,{size:'duct'}));
  assert.equal(new PlacementValidator(world).canPlace('coolingUnit',3,2),false);
});

test('a saved shared network reconnects both units from map geometry',()=>{
  const world=new World(8,5);
  world.addEntity(new CoolingUnit(1,2));world.addEntity(new CoolingUnit(5,2));world.addEntity(new SupplyVent(3,3));
  for(const x of [2,3,4])world.addUtility(new AirDuct(x,2,{size:'duct'}));
  const saves=new DataCenterSaveSystem({storage:null});
  const snapshot=saves.capture(world,{}, {budget:0,inventory:{},placedEntities:new Map(),placedMaterials:new Map()});
  const restored=new World(8,5);assert.equal(saves.restoreWorld(restored,snapshot),true);
  const metrics={generatedHeat:0,externalEnergy:0},system=new CoolingSystem(restored,new AirflowSystem(restored,metrics),metrics);
  system.update(1);
  assert.equal(system.networks.length,1);
  assert.equal(system.networks[0].status,'READY');
  assert.equal(system.networks[0].sourceUnits.length,2);
  assert.equal(system.networks[0].paths.length,2);
});
