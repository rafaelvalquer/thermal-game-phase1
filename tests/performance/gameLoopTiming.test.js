import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLoop } from '../../src/game/GameLoop.js';
import { PerformanceMonitor } from '../../src/performance/PerformanceMonitor.js';

test('game loop timing includes updates, render callback work, and update count per frame',()=>{
  let time=0,nextFrame=null,updates=0;
  const previousRequestFrame=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=callback=>{nextFrame=callback;};
  try{
    const monitor=new PerformanceMonitor({clock:()=>time});
    const loop=new GameLoop(()=>{updates++;time+=2;},()=>{time+=3;},{monitor});
    loop.running=true;

    time=100;loop.frame(100);
    assert.equal(updates,0);
    const next=nextFrame;
    monitor.frames.length=0;monitor.lastFrameAt=200;
    time=300;next(300);
    loop.running=false;

    const sample=monitor.snapshot();
    assert.equal(updates,2);
    assert.equal(sample.gameLoopWorkMs,7);
    assert.equal(sample.gameLoopUpdateMs,4);
    assert.equal(sample.gameLoopUpdates,20);
    assert.equal(sample.frameTime,100);
  }finally{
    if(previousRequestFrame===undefined)delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame=previousRequestFrame;
  }
});
