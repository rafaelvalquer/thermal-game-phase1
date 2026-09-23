import test from 'node:test';
import assert from 'node:assert/strict';
import { DuctPressureSolver } from '../../src/simulation/hvac/DuctPressureSolver.js';
import { World } from '../../src/world/World.js';
import { AirHandler } from '../../src/entities/AirHandler.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { DuctNetworkBuilder } from '../../src/simulation/hvac/DuctNetworkBuilder.js';
import { DuctFlowSolver } from '../../src/simulation/hvac/DuctFlowSolver.js';

test('longer and narrower duct runs have greater pressure resistance',()=>{
  const solver=new DuctPressureSolver();
  const small=Array.from({length:5},()=>({kind:'duct',entity:{type:'smallDuct',baseResistance:15}}));
  const longSmall=Array.from({length:20},()=>({kind:'duct',entity:{type:'smallDuct',baseResistance:15}}));
  const large=Array.from({length:5},()=>({kind:'duct',entity:{type:'largeDuct',baseResistance:1.8}}));
  assert.ok(solver.pathResistance(longSmall)>solver.pathResistance(small));
  assert.ok(solver.pathResistance(small)>solver.pathResistance(large));
});

test('closed dampers block a branch and partial opening increases resistance',()=>{
  const solver=new DuctPressureSolver(),duct={type:'mediumDuct',baseResistance:5,x:2,y:2,world:{utilityAt:()=>({opening:.5})}};
  const half=solver.pathResistance([{kind:'duct',entity:duct}]);duct.world.utilityAt=()=>({opening:0});
  assert.equal(solver.pathResistance([{kind:'duct',entity:duct}]),Infinity);
  duct.world.utilityAt=()=>({opening:.5});assert.ok(half>5*.5);
});

test('longer ducts reduce flow and larger ducts carry more air',()=>{
  const makeFlow=(size,length)=>{
    const world=new World(30,5),handler=new AirHandler(0,2,{maxAirFlow:10}),vent=new SupplyVent(length+1,2);
    world.addEntity(handler);world.addEntity(vent);
    for(let x=1;x<=length;x++)world.addUtility(new AirDuct(x,2,{size}));
    const network=new DuctNetworkBuilder(world).build().find(item=>item.role==='supply');
    return new DuctFlowSolver(world).solve(network).flowRate;
  };
  assert.ok(makeFlow('mediumDuct',12)<makeFlow('mediumDuct',4));
  assert.ok(makeFlow('largeDuct',6)>makeFlow('smallDuct',6));
});
