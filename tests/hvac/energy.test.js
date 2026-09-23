import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirHandler } from '../../src/entities/AirHandler.js';
import { Condenser } from '../../src/entities/Condenser.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { RefrigerantLine } from '../../src/entities/RefrigerantLine.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { ReturnVent } from '../../src/entities/ReturnVent.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { HVACSystem } from '../../src/simulation/hvac/HVACSystem.js';
import { EnergySystem } from '../../src/simulation/EnergySystem.js';

function addRefrigerantPath(world,handler,condenser){
  const from=handler.port('refrigerant'),to=condenser.refrigerantPort(),path=[];let x=from.x,y=from.y;
  path.push({x,y});
  while(x!==to.x){x+=Math.sign(to.x-x);path.push({x,y});}
  while(y!==to.y){y+=Math.sign(to.y-y);path.push({x,y});}
  for(const cell of path)world.addUtility(new RefrigerantLine(cell.x,cell.y));
}

function addAirPaths(world,handler,{supplyVent,returnVent}){
  const supply=handler.port('supply'),returns=handler.port('return');
  const connect=(start,end)=>{
    const path=[];let x=start.x,y=start.y;path.push({x,y});
    while(x!==end.x){x+=Math.sign(end.x-x);path.push({x,y});}
    while(y!==end.y){y+=Math.sign(end.y-y);path.push({x,y});}
    for(const cell of path)world.addUtility(new AirDuct(cell.x,cell.y));
  };
  world.addEntity(supplyVent);connect(supply,{x:supplyVent.x-1,y:supplyVent.y});
  if(returnVent){world.addEntity(returnVent);connect(returns,{x:returnVent.x-1,y:returnVent.y});}
}

test('air handler cools supply air and condenser rejects cooling plus electrical work',()=>{
  const world=new World(10,8),metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0};
  world.zones=[{x:2,y:2,width:7,height:5}];
  const handler=new AirHandler(2,3,{maxAirFlow:1,coolingCapacity:10000,rotation:1}),condenser=new Condenser(0,5,{coolingCapacity:15000});
  const supplyVent=new SupplyVent(5,3),returnVent=new ReturnVent(2,6);
  world.addEntity(handler);world.addEntity(condenser);addAirPaths(world,handler,{supplyVent,returnVent});addRefrigerantPath(world,handler,condenser);
  for(let y=4;y<=7;y++)for(let x=1;x<=3;x++)world.setTemperature(x,y,35);
  world.setTemperature(supplyVent.x,supplyVent.y,30);
  const airflow=new AirflowSystem(world,metrics),hvac=new HVACSystem(world,airflow,metrics),energy=new EnergySystem(world,metrics);energy.initialize();
  const dt=.1;hvac.update(dt);airflow.updateVelocity(dt);hvac.exchangeRooms(dt);hvac.rejectHeat(dt);energy.update(dt);
  assert.ok(handler.currentFlow>0);assert.ok(handler.supplyTemperature<handler.returnTemperature);
  assert.ok(handler.coolingPower>0);assert.ok(condenser.heatRejected>=handler.coolingPower);
  assert.ok(handler.coolingDemand>handler.coolingCapacity);assert.ok(handler.supplyTemperature>handler.targetSupplyTemperature);
  assert.ok(handler.actualRoomCooling>0);
  assert.ok(Math.abs(condenser.heatRejected-handler.coolingPower-condenser.electricalPower)<1e-6);
  assert.ok(Math.abs(handler.supplyFlow-handler.returnFlow)<1e-9);
  assert.ok(world.temperatureAt(supplyVent.x,supplyVent.y)<30);
  assert.equal(world.temperatureAt(returnVent.x,returnVent.y),35,'return sampling must not inject an artificial reference temperature');
  assert.ok(metrics.externalEnergy>0);assert.ok(Math.abs(metrics.hvacEnergyBalance.error)<1e-6);
});

test('HVAC does not run without a physical return vent',()=>{
  const world=new World(9,7),metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0};
  const handler=new AirHandler(1,3,{maxAirFlow:1,coolingCapacity:15000,rotation:1}),condenser=new Condenser(0,6,{coolingCapacity:20000}),vent=new SupplyVent(5,3);
  world.addEntity(handler);world.addEntity(condenser);addAirPaths(world,handler,{supplyVent:vent});addRefrigerantPath(world,handler,condenser);
  world.setTemperature(5,3,35);
  const airflow=new AirflowSystem(world,metrics),hvac=new HVACSystem(world,airflow,metrics);
  hvac.update(.1);airflow.updateVelocity(.1);hvac.exchangeRooms(.1);
  assert.equal(handler.status,'NO RETURN NETWORK');assert.equal(handler.currentFlow,0);assert.equal(handler.coolingPower,0);assert.equal(handler.actualRoomCooling,0);
});

test('hot outdoor conditions lower COP and can trigger high head status',()=>{
  const world=new World(9,7),metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0};
  world.environment.temperature=35;
  const handler=new AirHandler(1,3,{maxAirFlow:1,coolingCapacity:25000,rotation:2}),condenser=new Condenser(8,6,{coolingCapacity:30000}),vent=new SupplyVent(5,3),returns=new ReturnVent(1,6);
  world.addEntity(handler);world.addEntity(condenser);
  addAirPaths(world,handler,{supplyVent:vent,returnVent:returns});
  addRefrigerantPath(world,handler,condenser);
  for(let y=4;y<=6;y++)for(let x=0;x<=2;x++)world.setTemperature(x,y,40);
  const airflow=new AirflowSystem(world,metrics),hvac=new HVACSystem(world,airflow,metrics);
  hvac.update(.1);hvac.exchangeRooms(.1);
  assert.ok(handler.cop<condenser.cop);assert.equal(condenser.status,'HIGH HEAD');
});

test('indoor condenser returns rejected heat to the room instead of outdoor accounting',()=>{
  const world=new World(10,8),metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0};
  world.zones=[{id:'mechanical',x:0,y:0,width:9,height:7}];
  const handler=new AirHandler(2,3,{maxAirFlow:1,coolingCapacity:10000,rotation:2}),condenser=new Condenser(0,5,{coolingCapacity:15000});
  world.addEntity(handler);world.addEntity(condenser);addAirPaths(world,handler,{supplyVent:new SupplyVent(5,3),returnVent:new ReturnVent(2,6)});
  addRefrigerantPath(world,handler,condenser);
  for(let y=4;y<=7;y++)for(let x=1;x<=3;x++)world.setTemperature(x,y,35);
  const airflow=new AirflowSystem(world,metrics),hvac=new HVACSystem(world,airflow,metrics),energy=new EnergySystem(world,metrics);energy.initialize();
  hvac.update(.1);airflow.updateVelocity(.1);hvac.exchangeRooms(.1);
  const before=world.energy[world.index(condenser.x,condenser.y)];hvac.rejectHeat(.1);
  assert.equal(condenser.indoor,true);assert.ok(world.energy[world.index(condenser.x,condenser.y)]>before);
  assert.equal(metrics.externalEnergy,0);
});
