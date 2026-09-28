import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../../src/world/World.js';
import { Machine } from '../../../src/entities/Machine.js';
import { HeatHazeSourceDetector } from '../../../src/rendering/thermal/HeatHazeSourceDetector.js';
import { HeatHazeMask } from '../../../src/rendering/thermal/HeatHazeMask.js';
import { CoolingUnit } from '../../../src/entities/CoolingUnit.js';
import { ServerRack } from '../../../src/entities/ServerRack.js';
import { Radiator } from '../../../src/entities/Radiator.js';
import { EffectsRenderer } from '../../../src/rendering/EffectsRenderer.js';

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

test('an indoor cooling unit rejecting heat contributes a visible heat haze source',()=>{
  const world=new World(14,10),unit=new CoolingUnit(6,5);unit.indoor=true;unit.heatRejected=20000;world.addEntity(unit);
  const region=new HeatHazeSourceDetector().detect(world).find(item=>item.kind==='coolingUnit');
  assert.ok(region);assert.ok(region.intensity>0);
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

test('rack heat haze originates at its hot face and scales with generated heat',()=>{
  const world=new World(14,10),rack=world.addEntity(new ServerRack(6,5,{temperature:90,airExhaustDirection:{x:-1,y:0}}));
  rack.heatGenerationPower=22000;
  const detector=new HeatHazeSourceDetector(),full=detector.detect(world).find(region=>region.kind==='serverRack');
  rack.heatGenerationPower=2000;const low=detector.detect(world).find(region=>region.kind==='serverRack');
  assert.ok(full);assert.equal(full.x,5.5);assert.equal(full.y,5.5);assert.ok(full.direction.x<-.99);
  assert.ok(full.intensity>low.intensity,'larger rack heat output strengthens the haze');
  rack.heatGenerationPower=0;const idle=detector.detect(world).find(region=>region.kind==='serverRack');
  assert.ok(idle&&idle.intensity<low.intensity,'residual rack heat remains visible at lower intensity');
});

test('rack heat wisps start from the oriented hot face',()=>{
  const world=new World(14,10),rack=world.addEntity(new ServerRack(6,5,{temperature:75,airExhaustDirection:{x:-1,y:0}}));rack.heatGenerationPower=12000;
  const moves=[],ctx=new Proxy({save(){},restore(){},beginPath(){},stroke(){},arc(){},fill(){},fillText(){},moveTo(x,y){moves.push([x,y]);},lineTo(){},closePath(){}},{get(target,key){return key in target?target[key]:()=>{};},set(target,key,value){target[key]=value;return true;}});
  new EffectsRenderer().thermalEffects(ctx,world,10,1);
  assert.ok(moves.length>0);assert.ok(moves[0][0]<65,'wisps originate west of the rack center, on its hot face');
});

test('radiator haze appears only while it rejects heat and scales with rejected power',()=>{
  const world=new World(14,10),radiator=world.addEntity(new Radiator(6,5));radiator.energy=radiator.waterMass*4186*80;radiator.airInTemperature=25;radiator.thermalPower=4000;
  const detector=new HeatHazeSourceDetector(),low=detector.detect(world).find(region=>region.kind==='radiator');
  radiator.thermalPower=16000;const high=detector.detect(world).find(region=>region.kind==='radiator');
  assert.ok(low&&high);assert.ok(high.intensity>low.intensity);
  radiator.thermalPower=0;assert.equal(detector.detect(world).some(region=>region.kind==='radiator'),false);
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
