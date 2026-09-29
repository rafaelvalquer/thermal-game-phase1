import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsScheduler } from '../../src/simulation/PhysicsScheduler.js';

test('simulation speeds preserve elapsed physics time while bounding per-frame work',()=>{
  for(const speed of [1,2,4,8]){
    const scheduler=new PhysicsScheduler();let elapsed=0,maxSteps=0,frames=0;
    while(elapsed<1-1e-9){
      const frameSeconds=Math.min(1/60,(1-elapsed)/speed);
      scheduler.advance(frameSeconds,speed,{onStep:dt=>{elapsed+=dt;}});frames++;
      maxSteps=Math.max(maxSteps,scheduler.lastSubsteps);
      assert.ok(frames<100,`${speed}x did not finish the simulated second`);
    }
    assert.ok(Math.abs(elapsed-1)<1e-9,`${speed}x integrated ${elapsed}s instead of 1s`);
    assert.ok(maxSteps<=4,`${speed}x used ${maxSteps} substeps in one frame`);
  }
});

test('physics scheduler splits a step exactly at a calendar boundary',()=>{
  const scheduler=new PhysicsScheduler();let daySeconds=.99,boundaryCount=0;
  scheduler.advance(.12,1,{
    untilBoundary:()=>1-daySeconds,
    onStep:dt=>{daySeconds+=dt;if(Math.abs(daySeconds-1)<1e-9){boundaryCount++;daySeconds=0;}},
  });
  assert.equal(boundaryCount,1);
  assert.ok(Math.abs(daySeconds-.1)<1e-9);
  assert.ok(Math.abs(scheduler.backlogSeconds-.01)<1e-9,'fractional time after fixed-size steps stays queued');
  assert.ok(scheduler.lastSubsteps<=4);
});

test('physics scheduler preserves fractional time and caps extreme-frame backlog',()=>{
  const scheduler=new PhysicsScheduler({physicsQuantum:.05,maxPhysicsSubstepsPerFrame:4,maxBacklogSeconds:.3});let consumed=0;
  scheduler.advance(.03,1,{onStep:dt=>{consumed+=dt;}});assert.equal(scheduler.lastSubsteps,0);assert.ok(Math.abs(consumed)<1e-9);assert.ok(Math.abs(scheduler.backlogSeconds-.03)<1e-9);
  scheduler.advance(.02,1,{onStep:dt=>{consumed+=dt;}});assert.equal(scheduler.lastSubsteps,1);assert.ok(Math.abs(consumed-.05)<1e-9);
  scheduler.advance(.1,24,{onStep:dt=>{assert.ok(dt<=.1);consumed+=dt;}});
  assert.ok(scheduler.lastSubsteps<=4);assert.ok(scheduler.backlogSeconds<=.3);assert.ok(scheduler.droppedSeconds>0);
});

test('24x keeps all ordinary frame time under the four-step ceiling',()=>{
  const scheduler=new PhysicsScheduler();let consumed=0;
  scheduler.advance(1/60,24,{onStep:dt=>{assert.ok(dt<=.100001);consumed+=dt;}});
  assert.equal(scheduler.lastSubsteps,4);assert.ok(Math.abs(consumed-.4)<1e-9);assert.ok(scheduler.backlogSeconds<1e-9);
});

test('large updates respect the same four-step and backlog limits',()=>{
  const scheduler=new PhysicsScheduler();let consumed=0;
  scheduler.advance(.48,10,{onStep:dt=>{assert.ok(dt<=.1+1e-9);consumed+=dt;}});
  assert.equal(scheduler.lastSubsteps,4);
  assert.ok(Math.abs(consumed-.4)<1e-9);
  assert.ok(Math.abs(scheduler.backlogSeconds-1.6)<1e-9);
  assert.ok(scheduler.droppedSeconds>0);
});

test('paused time is not added to the simulation backlog',()=>{
  const scheduler=new PhysicsScheduler();let elapsed=0;
  scheduler.advance(60,8,{canAdvance:()=>false,onStep:dt=>{elapsed+=dt;}});
  assert.equal(elapsed,0);assert.equal(scheduler.lastSubsteps,0);assert.equal(scheduler.backlogSeconds,0);
});
