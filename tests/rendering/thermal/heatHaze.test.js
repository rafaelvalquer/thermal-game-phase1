import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../../src/world/World.js';
import { Machine } from '../../../src/entities/Machine.js';
import { HeatHazeSourceDetector } from '../../../src/rendering/thermal/HeatHazeSourceDetector.js';
import { HeatHazeMask } from '../../../src/rendering/thermal/HeatHazeMask.js';

const worldWithMachine=(temperature)=>{
  const world=new World(14,10);
  const machine=new Machine(6,5,{temperature,startAt:0});
  world.addEntity(machine);
  return {world,machine};
};

test('source below heat haze threshold is ignored',()=>{
  const {world}=worldWithMachine(40);
  const detector=new HeatHazeSourceDetector();
  assert.equal(detector.detect(world).filter(r=>r.kind==='machine').length,0);
});

test('hot machine produces heat haze region',()=>{
  const {world}=worldWithMachine(85);
  const detector=new HeatHazeSourceDetector();
  const region=detector.detect(world).find(r=>r.kind==='machine');
  assert.ok(region);
  assert.ok(region.intensity>0);
});

test('larger temperature delta produces stronger haze',()=>{
  const cool=worldWithMachine(60),hot=worldWithMachine(100);
  const detector=new HeatHazeSourceDetector();
  const a=detector.detect(cool.world).find(r=>r.kind==='machine');
  const b=detector.detect(hot.world).find(r=>r.kind==='machine');
  assert.ok(b.intensity>a.intensity);
});

test('airflow bends heat haze direction laterally',()=>{
  const {world,machine}=worldWithMachine(90);
  const i=world.index(machine.x,machine.y);
  world.airX[i]=5;world.airY[i]=0;
  const detector=new HeatHazeSourceDetector();
  const region=detector.detect(world).find(r=>r.kind==='machine');
  assert.ok(region.direction.x>0);
  assert.ok(region.direction.y<0);
});

test('offscreen heat source is culled by viewport bounds',()=>{
  const {world}=worldWithMachine(90);
  const detector=new HeatHazeSourceDetector();
  const regions=detector.detect(world,{x1:0,y1:0,x2:3,y2:3});
  assert.equal(regions.filter(r=>r.kind==='machine').length,0);
});

test('thermal mode intentionally reduces haze intensity',()=>{
  const mask=new HeatHazeMask(),region={intensity:.8};
  assert.ok(mask.effectiveIntensity(region,'thermal')<mask.effectiveIntensity(region,'normal'));
  assert.ok(mask.effectiveIntensity(region,'pressure')<mask.effectiveIntensity(region,'airflow'));
});
