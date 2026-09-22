import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/World.js';
import { ThermalSystem } from '../src/simulation/ThermalSystem.js';
import { AirflowSystem } from '../src/simulation/AirflowSystem.js';
import { FluidSystem } from '../src/simulation/FluidSystem.js';
import { Fan } from '../src/entities/Fan.js';
import { ExhaustFan } from '../src/entities/ExhaustFan.js';
import { Radiator } from '../src/entities/Radiator.js';
import { Pump } from '../src/entities/Pump.js';
import { Pipe } from '../src/entities/Pipe.js';

const metrics=()=>({generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0});
const close=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} ≉ ${b}`);

test('conduction converges two temperatures and conserves energy',()=>{
  const w=new World(2,1);w.setMaterial(0,0,'copper');w.setMaterial(1,0,'copper');w.setTemperature(0,0,100);w.setTemperature(1,0,0);
  const before=w.totalTileEnergy();new ThermalSystem(w,metrics()).conduct(.05);
  assert.ok(w.temperatureAt(0,0)<100);assert.ok(w.temperatureAt(1,0)>0);close(w.totalTileEnergy(),before,1e-10);
});

test('copper transfers heat faster than wood',()=>{
  const run=(mat)=>{const w=new World(2,1);w.setMaterial(0,0,mat);w.setMaterial(1,0,mat);w.setTemperature(0,0,100);w.setTemperature(1,0,0);new ThermalSystem(w,metrics()).conduct(.05);return w.temperatureAt(1,0);};
  assert.ok(run('copper')>run('wood'));
});

test('same energy raises air temperature much more than water',()=>{
  const air=new World(1,1),water=new World(1,1);water.setMaterial(0,0,'water');air.setTemperature(0,0,25);water.setTemperature(0,0,25);const q=50_000;air.addEnergyAt(0,0,q);water.addEnergyAt(0,0,q);
  assert.ok(air.temperatureAt(0,0)-25>(water.temperatureAt(0,0)-25)*100);
});

test('fan conserves thermal energy',()=>{
  const w=new World(7,3);w.setTemperature(2,1,70);w.addEntity(new Fan(1,1,{x:1,y:0}));const before=w.totalTileEnergy();new AirflowSystem(w,metrics()).update(.05);close(w.totalTileEnergy(),before,1e-10);
});

test('fan transports heat downstream',()=>{
  const w=new World(7,3);w.setTemperature(2,1,80);const fan=new Fan(1,1,{x:1,y:0});w.addEntity(fan);const sys=new AirflowSystem(w,metrics()),before=w.temperatureAt(3,1);for(let i=0;i<20;i++)sys.update(.05);assert.ok(w.temperatureAt(3,1)>before);
});

test('exhaust transfers removed heat to outdoor accounting',()=>{
  const w=new World(3,3);w.setTemperature(1,1,60);w.addEntity(new ExhaustFan(1,1,{x:1,y:0}));const m=metrics(),sys=new AirflowSystem(w,m),before=w.totalTileEnergy();sys.applyExhaust(.5);const lost=before-w.totalTileEnergy();assert.ok(lost>0);close(m.externalEnergy,lost,1e-10);
});

test('connected pump creates flow',()=>{
  const w=new World(4,1);w.addEntity(new Pump(0,0));w.addEntity(new Pipe(1,0));w.addEntity(new Pipe(2,0));const sys=new FluidSystem(w,metrics());sys.update(.05);assert.ok(w.entities.find(e=>e.type==='pipe').flowRate>0);
});

test('radiator moves heat from water into air conservatively',()=>{
  const w=new World(3,3),r=new Radiator(1,1);r.energy=r.waterMass*4186*80;w.addEntity(r);const sys=new FluidSystem(w,metrics()),i=w.index(1,1),before=r.energy+w.energy[i],airBefore=w.temperatureAt(1,1);sys.radiate(.1);assert.ok(r.waterTemperature<80);assert.ok(w.temperatureAt(1,1)>airBefore);close(r.energy+w.energy[i],before,1e-10);
});
