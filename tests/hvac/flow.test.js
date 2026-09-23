import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirHandler } from '../../src/entities/AirHandler.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { ReturnVent } from '../../src/entities/ReturnVent.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { DuctNetworkBuilder } from '../../src/simulation/hvac/DuctNetworkBuilder.js';
import { DuctFlowSolver } from '../../src/simulation/hvac/DuctFlowSolver.js';
import { DuctDamper } from '../../src/entities/DuctDamper.js';
import { HVACSystem } from '../../src/simulation/hvac/HVACSystem.js';

test('straight duct delivers positive flow from air handler to vent',()=>{
  const world=new World(8,5),handler=new AirHandler(0,2,{rotation:2}),vent=new SupplyVent(5,2);
  world.addEntity(handler);world.addEntity(vent);for(let x=1;x<5;x++)world.addUtility(new AirDuct(x,2));
  const network=new DuctNetworkBuilder(world).build().find(item=>item.role==='supply');
  new DuctFlowSolver(world).solve(network);
  assert.ok(network.flowRate>0);assert.ok(vent.flowRate>0);
  assert.ok(network.ducts.every(duct=>duct.flowRate>0));
});

test('disconnecting a network clears stale duct and vent flow',()=>{
  const world=new World(8,5),handler=new AirHandler(0,2,{rotation:2}),vent=new SupplyVent(5,2);
  world.addEntity(handler);world.addEntity(vent);for(let x=1;x<5;x++)world.addUtility(new AirDuct(x,2));
  const builder=new DuctNetworkBuilder(world),solver=new DuctFlowSolver(world),ducts=world.allUtilities();
  solver.solve(builder.build().find(item=>item.role==='supply'));
  assert.ok(ducts[0].flowRate>0);assert.ok(vent.flowRate>0);
  world.removeEntity(handler);
  const disconnected=builder.build().find(item=>item.role==='supply');solver.solve(disconnected);
  assert.equal(disconnected.status,'NO AIR HANDLER');
  assert.ok(ducts.every(duct=>duct.flowRate===0));assert.equal(vent.flowRate,0);
});

test('parallel branches divide flow by resistance and conserve total flow',()=>{
    const world=new World(10,7),handler=new AirHandler(1,3,{maxAirFlow:2,rotation:2});world.addEntity(handler);
  const junction=[new AirDuct(2,3)];junction.forEach(item=>world.addUtility(item));
  for(const [y,size,ventX] of [[2,'largeDuct',6],[4,'smallDuct',6]]){
    world.addUtility(new AirDuct(3,3));world.addUtility(new AirDuct(3,y,{size}));world.addUtility(new AirDuct(4,y,{size}));world.addUtility(new AirDuct(5,y,{size}));world.addEntity(new SupplyVent(ventX,y));
  }
  const network=new DuctNetworkBuilder(world).build().find(item=>item.role==='supply');
  new DuctFlowSolver(world).solve(network);
  assert.equal(network.vents.length,2);assert.ok(network.paths[0].flowRate>network.paths[1].flowRate);
  assert.ok(Math.abs(network.paths.reduce((sum,path)=>sum+path.flowRate,0)-network.flowRate)<1e-9);
});

test('closing a branch damper reduces its vent flow',()=>{
  const makeFlows=opening=>{
    const world=new World(9,7),handler=new AirHandler(1,3,{maxAirFlow:3,rotation:2});world.addEntity(handler);
    world.addUtility(new AirDuct(2,3));
    for(const y of [2,4]){
      world.addUtility(new AirDuct(3,3));world.addUtility(new AirDuct(3,y));world.addUtility(new AirDuct(4,y));
      world.addUtility(new AirDuct(5,y));world.addEntity(new SupplyVent(6,y));
    }
    const damper=new DuctDamper(4,2,{opening});world.addUtility(damper);
    const network=new DuctNetworkBuilder(world).build().find(item=>item.role==='supply');
    new DuctFlowSolver(world).solve(network);
    assert.equal(damper.networkId,network.id);
    assert.ok(network.ducts.every(duct=>Number.isFinite(duct.pressure)&&Number.isFinite(duct.pressureLoss)));
    return network.paths.find(path=>path.vent.y===2).flowRate;
  };
  assert.ok(makeFlows(0)<makeFlows(1));
});

test('unbalanced supply and return create signed room pressure',()=>{
  const world=new World(8,8);world.zones=[{id:'room',x:0,y:0,width:8,height:8}];
  const handler=new AirHandler(1,1),supply=new SupplyVent(2,2),returns=new ReturnVent(5,5);
  world.addEntity(handler);world.addEntity(supply);world.addEntity(returns);
  const hvac=new HVACSystem(world,null,{});
  hvac.handlers=[handler];hvac.networks=[
    {role:'supply',airHandlers:[handler],vents:[supply],designFlowRate:2,flowRate:2,paths:[{vent:supply,designFlowRate:2}]},
    {role:'return',airHandlers:[handler],vents:[returns],designFlowRate:1,flowRate:1,paths:[{vent:returns,designFlowRate:1}]},
  ];
  hvac.updateZonePressures(1);
  assert.ok(world.hvacZonePressure.get('room')>0);
  hvac.networks[0].paths[0].designFlowRate=.5;hvac.networks[1].paths[0].designFlowRate=2;
  for(let i=0;i<6;i++)hvac.updateZonePressures(1);
  assert.ok(world.hvacZonePressure.get('room')<0);
});
