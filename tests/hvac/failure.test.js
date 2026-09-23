import test from 'node:test';
import assert from 'node:assert/strict';
import { FailureSystem } from '../../src/campaign/FailureSystem.js';

test('HVAC overload hold timers are tracked per equipment and reset when recovered',()=>{
  const first={id:'ah-1',type:'airHandler',status:'OVERLOAD'},second={id:'ah-2',type:'airHandler',status:'READY'};
  const world={entities:[first,second]},level={failures:[{type:'hvacOverload',hold:30}]};
  const failures=new FailureSystem(world,level);
  assert.equal(failures.update(15).failed,false);
  first.status='READY';second.status='OVERLOAD';
  assert.equal(failures.update(15).failed,false);
  second.status='READY';first.status='OVERLOAD';
  assert.equal(failures.update(15).failed,false);
  assert.equal(failures.update(15).failed,true);
});

test('high condenser head pressure is exposed with a per-condenser countdown',()=>{
  const condenser={id:'cd-1',type:'condenser',status:'HIGH HEAD'},world={entities:[condenser]};
  const failures=new FailureSystem(world,{failures:[{type:'condenserHighHead',hold:20}]});
  failures.update(8);
  assert.equal(failures.statusFor(condenser).remaining,12);
  assert.equal(failures.update(12).failed,true);
});
