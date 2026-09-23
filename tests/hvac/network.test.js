import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirHandler } from '../../src/entities/AirHandler.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { ReturnVent } from '../../src/entities/ReturnVent.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { DuctNetworkBuilder } from '../../src/simulation/hvac/DuctNetworkBuilder.js';

test('duct graph connects handler to supply and return endpoints independently',()=>{
  const world=new World(9,7),handler=new AirHandler(2,3,{rotation:2});
  world.addEntity(handler);world.addEntity(new SupplyVent(5,3));world.addEntity(new ReturnVent(1,6));
  world.addUtility(new AirDuct(3,3));world.addUtility(new AirDuct(4,3));
  world.addUtility(new AirDuct(1,3));world.addUtility(new AirDuct(1,4));world.addUtility(new AirDuct(1,5));
  const networks=new DuctNetworkBuilder(world).build();
  const supply=networks.find(network=>network.role==='supply');
  const returns=networks.find(network=>network.role==='return');
  assert.equal(supply.status,'READY');assert.equal(supply.vents.length,1);assert.equal(supply.ducts.length,2);
  assert.equal(returns.status,'READY');assert.equal(returns.vents.length,1);assert.equal(returns.ducts.length,3);
});

test('network graph reports an unserved duct dead end',()=>{
  const world=new World(9,7),handler=new AirHandler(1,3,{rotation:2}),vent=new SupplyVent(5,3);
  world.addEntity(handler);world.addEntity(vent);
  for(const [x,y] of [[2,3],[3,3],[4,3],[3,4]])world.addUtility(new AirDuct(x,y));
  const network=new DuctNetworkBuilder(world).build().find(item=>item.role==='supply');
  assert.equal(network.status,'READY');assert.equal(network.deadEnds.length,1);
  assert.equal(network.deadEnds[0].networkStatus,'DEAD END');
});
