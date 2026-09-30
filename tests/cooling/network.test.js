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
import { ServerRack } from '../../src/entities/ServerRack.js';

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
  assert.deepEqual(networks.map(network=>network.sourceUnit.ratedCoolingCapacity),[55000,55000]);
});

test('industrial two-tile condenser connects through its rear cell while keeping its outlet clear',()=>{
  const world=new World(9,6),unit=new CoolingUnit(4,2,{tier:'industrial',ratedCoolingCapacity:50000,maxAirFlow:5,direction:{x:1,y:0}});
  world.addEntity(unit);world.addUtility(new AirDuct(3,2,{size:'duct'}));world.addUtility(new AirDuct(2,2,{size:'duct'}));world.addEntity(new SupplyVent(1,2));
  assert.equal(world.entityAt(5,2),unit);
  assert.equal(world.entityAt(6,2),undefined,'the discharge cell remains outside the footprint');
  const network=new CoolingNetworkBuilder(world).build()[0];
  assert.equal(network.status,'READY');assert.equal(network.sourceUnit,unit);assert.equal(network.paths.length,1);
});

test('an adjacent air outlet joins its duct network and receives positive airflow',()=>{
  const world=new World(8,5),{unit,outlet}=addLine(world,{id:'plug-test',x:1,y:2,ducts:[{x:2,y:2}],vent:{x:3,y:2}});
  const cooling=new CoolingSystem(world,new AirflowSystem(world,{}),{});cooling.update(.2);
  const network=cooling.networks[0];
  assert.equal(network.status,'READY');assert.equal(outlet.networkId,unit.networkId);
  assert.equal(outlet.networkStatus,'READY');assert.ok(outlet.flowRate>0);
});

test('duct graph reports missing source and outlet, and accepts multiple sources',()=>{
  const world=new World(8,8);
  world.addUtility(new AirDuct(2,1,{size:'duct'}));world.addEntity(new SupplyVent(3,1));
  world.addUtility(new AirDuct(2,3,{size:'duct'}));world.addEntity(new CoolingUnit(1,3));
  world.addUtility(new AirDuct(2,5,{size:'duct'}));world.addEntity(new CoolingUnit(1,5));world.addEntity(new CoolingUnit(3,5));world.addEntity(new SupplyVent(2,6));
  const status=new CoolingNetworkBuilder(world).build().map(network=>network.status);
  assert.deepEqual(status,['NO COOLING UNIT','NO OUTLET','READY']);
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

test('automatic outlet allocation prioritizes hotter rack groups and falls back to equal shares',()=>{
  const network={status:'READY',paths:[
    {vent:{flowMode:'auto',flowWeight:1},autoWeight:8,efficiency:1},
    {vent:{flowMode:'auto',flowWeight:1},autoWeight:1,efficiency:1},
  ]},solver=new CoolingDistributionSolver();
  const [hot,cool]=solver.solve(network,2.4);
  assert.equal(hot.flowRate,2.1333333333333333);
  assert.equal(cool.flowRate,.26666666666666666);
  network.paths.forEach(path=>path.autoWeight=1);
  const [first,second]=solver.solve(network,2.4);
  assert.equal(first.flowRate,1.2);assert.equal(second.flowRate,1.2);
});

test('cooling system routes more automatic airflow to the outlet serving racks above SLA',()=>{
  const world=new World(12,8),unit=new CoolingUnit(0,0),hotVent=new SupplyVent(2,1,{direction:{x:0,y:1}}),coolVent=new SupplyVent(8,1,{direction:{x:0,y:1}});
  const hotRack=new ServerRack(2,3,{slaTemperature:30}),coolRack=new ServerRack(8,3,{slaTemperature:30});
  world.addEntity(unit);world.addEntity(hotVent);world.addEntity(coolVent);world.addEntity(hotRack);world.addEntity(coolRack);
  world.setTemperature(2,2,50);world.setTemperature(8,2,30);
  const network={id:'auto-test',sourceUnit:unit,sourceUnits:[unit],ducts:[],vents:[hotVent,coolVent],status:'READY',paths:[
    {vent:hotVent,path:[],efficiency:1,unit},{vent:coolVent,path:[],efficiency:1,unit},
  ]},metrics={},system=new CoolingSystem(world,new AirflowSystem(world,metrics),metrics);system.builder.build=()=>[network];
  system.update(1);
  assert.ok(hotVent.flowRate>coolVent.flowRate);
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

  assert.equal(network.paths[0].flowRate,3);
  assert.equal(network.paths[1].flowRate,1.5);
  assert.ok(Math.abs(network.paths[0].cooling/network.paths[1].cooling-2)<1e-8);
});

test('placing a duct can join two cooling units',()=>{
  const world=new World(8,5);
  world.addEntity(new CoolingUnit(1,2));world.addUtility(new AirDuct(2,2,{size:'duct'}));
  world.addEntity(new CoolingUnit(5,2));world.addUtility(new AirDuct(4,2,{size:'duct'}));
  const validator=new PlacementValidator(world);
  assert.equal(validator.canPlace('duct',3,2),true);
  assert.equal(validator.canPlace('duct',3,1),true);
});

test('placing a second unit on an owned duct network is allowed while ambiguous outlets are rejected',()=>{
  const world=new World(8,8),unit=new CoolingUnit(1,2);world.addEntity(unit);world.addUtility(new AirDuct(2,2,{size:'duct'}));
  world.thermalSystems={simpleCooling:true};
  const validator=new PlacementValidator(world);
  assert.equal(validator.canPlace('coolingUnit',3,2),true);
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
  assert.ok(a.availableCapacity>=55000);assert.ok(b.availableCapacity>=55000);
  assert.ok(vents[0].flowRate>0&&vents[1].flowRate>0&&vents[2].flowRate>0);
  assert.equal(vents[0].networkId,vents[2].networkId);
  assert.notEqual(vents[0].networkId,vents[1].networkId);
});
