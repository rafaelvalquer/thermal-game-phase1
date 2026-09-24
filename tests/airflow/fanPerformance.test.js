import test from 'node:test';
import assert from 'node:assert/strict';
import { AirTestScenarios } from '../../src/simulation/air/AirTestScenarios.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';

const settle=s=>{
  const system=new AirflowSystem(s.world,{externalEnergy:0});
  for(let i=0;i<360;i++)system.updateVelocity(.05);
  return {...s,system};
};

test('open fan delivers at least 65% of its production free flow after projection',()=>{
  const {fan,world}=settle(AirTestScenarios.openFan());
  assert.ok(fan.flowEfficiency>=.65,fan.flowEfficiency);
  assert.ok(fan.currentFlow<=fan.qFree);
  assert.equal(fan.flowEfficiency,fan.currentFlow/fan.qFree);
  assert.equal(world.airDiagnostics.fanCount,1);
  assert.equal(world.airDiagnostics.totalFanActualFlow,fan.currentFlow);
  assert.ok(world.airDiagnostics.maxDivergence<1.5);
});

test('dead end delivers less than 60% of the corresponding open corridor',()=>{
  const open=settle(AirTestScenarios.straightDuct({length:20,width:3}));
  const closed=settle(AirTestScenarios.deadEnd());
  assert.ok(closed.fan.currentFlow<open.fan.currentFlow*.6);
});

test('series fans increase downstream speed, while disabled fans report no delivery',()=>{
  const one=settle(AirTestScenarios.straightDuct({length:22,width:5}));
  const two=settle(AirTestScenarios.twoFansSeries());
  const speed=s=>Math.hypot(s.world.airX[s.world.index(15,8)],s.world.airY[s.world.index(15,8)]);
  assert.ok(speed(two)>speed(one));
  two.secondFan.enabled=false;two.system.updateVelocity(.05);
  assert.equal(two.secondFan.currentFlow,0);
  assert.equal(two.world.airDiagnostics.fanCount,1);
});
