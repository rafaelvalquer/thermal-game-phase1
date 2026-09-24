import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { CoolingNetworkBuilder } from '../../src/simulation/cooling/CoolingNetworkBuilder.js';
import { CoolingDistributionSolver } from '../../src/simulation/cooling/CoolingDistributionSolver.js';
import { PlacementValidator } from '../../src/building/PlacementValidator.js';
import { CoolingSystem } from '../../src/simulation/cooling/CoolingSystem.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';

function addLine(world,{id,x=1,y=2,ducts=[{x:x+1,y},{x:x+2,y}],vent={x:x+3,y},weight=1,tier={}}={}){
  const unit=new CoolingUnit(x,y,{...tier});unit.missionId=id;world.addEntity(unit);
  for(const p of ducts)world.addUtility(new AirDuct(p.x,p.y,{size:'duct',embedded:true}));
  const outlet=new SupplyVent(vent.x,vent.y,{flowWeight:weight});world.addEntity(outlet);
  return {unit,outlet};
}

test('independent cooling units keep their own full capacity and separate network ownership',()=>{
  const world=new World(12,8);
  const first=addLine(world,{id:'ac-a',x:1,y:1}),second=addLine(world,{id:'ac-b',x:1,y:5});
  const networks=new CoolingNetworkBuilder(world).build();
  assert.equal(networks.length,2);
  assert.ok(networks.every(network=>network.status==='READY'));
  assert.notEqual(first.unit.networkId,second.unit.networkId);
  assert.equal(networks[0].availableCooling,0);
  assert.deepEqual(networks.map(network=>network.sourceUnit.ratedCoolingCapacity),[25000,25000]);
});

test('duct graph reports missing source, missing outlet, and multiple sources',()=>{
  const world=new World(8,8);
  world.addUtility(new AirDuct(2,1,{size:'duct'}));world.addEntity(new SupplyVent(3,1));
  world.addUtility(new AirDuct(2,3,{size:'duct'}));world.addEntity(new CoolingUnit(1,3));
  world.addUtility(new AirDuct(2,5,{size:'duct'}));world.addEntity(new CoolingUnit(1,5));world.addEntity(new CoolingUnit(3,5));world.addEntity(new SupplyVent(2,6));
  const status=new CoolingNetworkBuilder(world).build().map(network=>network.status);
  assert.deepEqual(status,['NO COOLING UNIT','NO OUTLET','MULTIPLE COOLING UNITS']);
});

test('duct length and bends reduce branch efficiency',()=>{
  const world=new World(12,8),line=addLine(world,{id:'ac',ducts:[{x:2,y:2},{x:3,y:2},{x:3,y:3},{x:3,y:4}],vent:{x:4,y:4}});
  const network=new CoolingNetworkBuilder(world).build()[0];
  assert.equal(network.sourceUnit,line.unit);
  assert.ok(network.paths[0].efficiency<1);
  assert.ok(network.paths[0].efficiency>=.65);
});

test('outlet weights split one unit airflow proportionally',()=>{
  const network={status:'READY',paths:[
    {vent:{flowWeight:1},efficiency:1},
    {vent:{flowWeight:3},efficiency:1},
  ]};
  const [low,high]=new CoolingDistributionSolver().solve(network,2.4);
  assert.ok(Math.abs(low.flowRate-.6)<1e-9);
  assert.ok(Math.abs(high.flowRate-1.8)<1e-9);
});

test('branch efficiency is counted once when dividing cooling between outlets',()=>{
  const world=new World(10,8);world.zones=[{id:'room',x:3,y:1,width:7,height:6}];
  for(let y=1;y<7;y++)for(let x=3;x<10;x++)world.setTemperature(x,y,32);
  const unit=new CoolingUnit(0,2),near=new SupplyVent(3,2),far=new SupplyVent(3,5);
  world.addEntity(unit);world.addEntity(near);world.addEntity(far);
  const metrics={},system=new CoolingSystem(world,new AirflowSystem(world,metrics),metrics);
  const network={id:'test-network',sourceUnit:unit,sourceUnits:[unit],ducts:[],vents:[near,far],status:'READY',paths:[
    {vent:near,path:[],efficiency:1},
    {vent:far,path:[],efficiency:.5},
  ]};
  system.builder.build=()=>[network];
  system.update(1);

  assert.equal(network.paths[0].flowRate,1.25);
  assert.equal(network.paths[1].flowRate,.625);
  assert.ok(Math.abs(network.paths[0].cooling/network.paths[1].cooling-2)<1e-8);
});

test('placing a duct that joins two cooling units is rejected',()=>{
  const world=new World(8,5);
  world.addEntity(new CoolingUnit(1,2));world.addUtility(new AirDuct(2,2,{size:'duct'}));
  world.addEntity(new CoolingUnit(5,2));world.addUtility(new AirDuct(4,2,{size:'duct'}));
  const validator=new PlacementValidator(world);
  assert.equal(validator.canPlace('duct',3,2),false);
  assert.equal(validator.canPlace('duct',3,1),true);
});

test('placing a second unit on an owned duct network and one outlet across two networks is rejected',()=>{
  const world=new World(8,8),unit=new CoolingUnit(1,2);world.addEntity(unit);world.addUtility(new AirDuct(2,2,{size:'duct'}));
  world.thermalSystems={simpleCooling:true};
  const validator=new PlacementValidator(world);
  assert.equal(validator.canPlace('coolingUnit',3,2),false);
  assert.equal(validator.canPlace('coolingUnit',5,5),true);
  world.addUtility(new AirDuct(2,4,{size:'duct'}));
  assert.equal(validator.canPlace('supplyVent',2,3),false);
});

test('separate disconnected branches on one unit are rejected as ambiguous',()=>{
  const world=new World(8,5),unit=new CoolingUnit(3,2);world.addEntity(unit);
  world.addUtility(new AirDuct(2,2,{size:'duct'}));world.addUtility(new AirDuct(4,2,{size:'duct'}));
  world.addEntity(new SupplyVent(1,2));world.addEntity(new SupplyVent(5,2));
  const networks=new CoolingNetworkBuilder(world).build();
  assert.ok(networks.every(network=>network.status==='MULTIPLE NETWORKS'));
  assert.equal(unit.status,'MULTIPLE NETWORKS');
});

test('one unit divides flow across several outlets and separate units can cool the same room',()=>{
  const world=new World(12,8);world.zones=[{id:'room',x:2,y:0,width:10,height:8}];
  const a=new CoolingUnit(0,1),b=new CoolingUnit(0,5);world.addEntity(a);world.addEntity(b);
  for(const y of [1,5]){world.addUtility(new AirDuct(1,y,{size:'duct'}));world.addUtility(new AirDuct(2,y,{size:'duct'}));}
  const vents=[new SupplyVent(3,1),new SupplyVent(3,5),new SupplyVent(5,1)];vents.forEach(vent=>world.addEntity(vent));
  world.addUtility(new AirDuct(3,1,{size:'duct'}));world.addUtility(new AirDuct(4,1,{size:'duct'}));
  const metrics={},airflow=new AirflowSystem(world,metrics),system=new CoolingSystem(world,airflow,metrics);system.update(1);
  assert.equal(system.networks.length,2);assert.ok(system.networks.every(network=>network.status==='READY'));
  assert.equal(system.networks[0].vents.length,2);assert.equal(system.networks[1].vents.length,1);
  assert.ok(a.availableCapacity>=25000);assert.ok(b.availableCapacity>=25000);
  assert.ok(vents[0].flowRate>0&&vents[1].flowRate>0&&vents[2].flowRate>0);
  assert.equal(vents[0].networkId,vents[2].networkId);
  assert.notEqual(vents[0].networkId,vents[1].networkId);
});
