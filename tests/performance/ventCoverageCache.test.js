import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { CoolingAirExchange } from '../../src/simulation/cooling/CoolingAirExchange.js';

test('vent geometry is reused for 100 dynamic cooling queries and invalidated by layout changes',()=>{
  const world=new World(20,12),vent=world.addEntity(new SupplyVent(4,4,{direction:{x:1,y:0}}));
  const rack=world.addEntity(new ServerRack(8,4,{airIntakeDirection:{x:-1,y:0},temperature:40,slaTemperature:30}));
  const exchange=new CoolingAirExchange(world,null);

  for(let tick=0;tick<100;tick++){
    world.setTemperature(5,4,30+tick%10);
    exchange.supplyCells(vent);exchange.serviceRacks(vent);exchange.coolingDemand(vent);
  }
  assert.equal(exchange.coverage.geometryCalculations,1);

  world.setMaterial(6,4,'concrete');exchange.supplyCells(vent);
  assert.equal(exchange.coverage.geometryCalculations,2,'a wall change rebuilds reachable coverage');
  world.moveEntity(rack,9,4);exchange.supplyCells(vent);
  assert.equal(exchange.coverage.geometryCalculations,3,'a rack move rebuilds rack candidates');
  world.moveEntity(vent,5,4);exchange.supplyCells(vent);
  assert.equal(exchange.coverage.geometryCalculations,4,'a vent move rebuilds its coverage');
});
