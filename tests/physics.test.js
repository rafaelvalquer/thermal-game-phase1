import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/World.js';
import { ThermalSystem } from '../src/simulation/ThermalSystem.js';
import { AirflowSystem } from '../src/simulation/AirflowSystem.js';
import { FluidSystem } from '../src/simulation/FluidSystem.js';
import { PlacementValidator } from '../src/building/PlacementValidator.js';
import { Fan } from '../src/entities/Fan.js';
import { ExhaustFan } from '../src/entities/ExhaustFan.js';
import { Radiator } from '../src/entities/Radiator.js';
import { HeatExchanger } from '../src/entities/HeatExchanger.js';
import { WaterTank } from '../src/entities/WaterTank.js';
import { Pump } from '../src/entities/Pump.js';
import { Pipe } from '../src/entities/Pipe.js';
import { Machine } from '../src/entities/Machine.js';

const metrics=()=>({generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0});
const close=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),String(a)+' != '+String(b));

const addClosedLoop=(world,{machine=false,tank=false}={})=>{
  const pump=new Pump(1,1,{x:1,y:0});
  const p1=new Pipe(2,1);
  const hx=new HeatExchanger(3,1);
  const p2=new Pipe(3,2);
  const radiator=new Radiator(3,3);
  const p3=new Pipe(2,3);
  const p4=tank?new WaterTank(1,3):new Pipe(1,3);
  const p5=new Pipe(1,2);
  const fluid=[pump,p1,hx,p2,radiator,p3,p4,p5];
  fluid.forEach(e=>world.addEntity(e));
  let heatMachine=null;
  if(machine){
    heatMachine=new Machine(4,1,{name:'Test Machine',heatOutput:0,temperature:90,startAt:0});
    heatMachine.started=true;
    world.addEntity(heatMachine);
  }
  return {pump,p1,hx,p2,radiator,p3,p4,p5,machine:heatMachine,fluid};
};

const totalThermalEnergy=(world)=>world.totalTileEnergy()+world.entities.reduce((sum,e)=>{
  if(e.isHeatMachine||['pipe','pump','tank','radiator','exchanger'].includes(e.type))return sum+(e.energy||0);
  return sum;
},0);

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
  const w=new World(7,5);w.setTemperature(2,2,60);const exhaust=new ExhaustFan(2,2,{x:1,y:0});w.addEntity(exhaust);const m=metrics(),sys=new AirflowSystem(w,m);
  for(let i=0;i<80;i++)sys.updateVelocity(.05);
  const before=w.totalTileEnergy();sys.applyExhaust(.5);const lost=before-w.totalTileEnergy();assert.ok(exhaust.currentFlow>0);assert.ok(lost>0);close(m.externalEnergy,lost,1e-10);
});

test('open hydraulic circuit has zero flow',()=>{
  const w=new World(5,2),pump=new Pump(0,0,{x:1,y:0}),p1=new Pipe(1,0),p2=new Pipe(2,0);
  w.addEntity(pump);w.addEntity(p1);w.addEntity(p2);
  const sys=new FluidSystem(w,metrics());sys.update(.05);
  assert.equal(pump.flowRate,0);assert.equal(p1.flowRate,0);assert.equal(pump.networkStatus,'OPEN CIRCUIT');
});

test('closed hydraulic loop creates directed flow from pump outlet',()=>{
  const w=new World(6,6),loop=addClosedLoop(w);
  const sys=new FluidSystem(w,metrics());sys.update(.05);
  assert.ok(loop.pump.flowRate>0);
  assert.equal(loop.pump.networkStatus,'CLOSED');
  assert.equal(loop.pump.downstreamId,loop.p1.id);
  assert.deepEqual(loop.pump.flowVector,{x:1,y:0});
  assert.equal(loop.fluid.every(e=>e.circuitClosed&&e.flowRate===loop.pump.flowRate),true);
});

test('pump direction must point at its downstream connection',()=>{
  const w=new World(6,6),loop=addClosedLoop(w);
  loop.pump.direction={x:0,y:-1};
  const sys=new FluidSystem(w,metrics());sys.update(.05);
  assert.equal(loop.pump.flowRate,0);
  assert.equal(loop.pump.networkStatus,'PUMP DIRECTION');
});

test('heat exchanger does not cool machine without valid flow',()=>{
  const w=new World(6,4),machine=new Machine(3,1,{temperature:90,heatOutput:0,startAt:0}),hx=new HeatExchanger(2,1),pipe=new Pipe(1,1);
  machine.started=true;w.addEntity(machine);w.addEntity(hx);w.addEntity(pipe);
  const sys=new FluidSystem(w,metrics()),before=machine.energy;
  for(let i=0;i<50;i++)sys.update(.05);
  close(machine.energy,before,1e-12);
  assert.equal(hx.thermalPower,0);
});

test('radiator spreads heat over surrounding air and conserves energy',()=>{
  const w=new World(5,5),r=new Radiator(2,2);r.energy=r.waterMass*4186*80;w.addEntity(r);
  const sys=new FluidSystem(w,metrics()),before=r.energy+w.totalTileEnergy(),neighborBefore=w.temperatureAt(2,1);
  sys.radiate(.1);
  assert.ok(r.waterTemperature<80);
  assert.ok(w.temperatureAt(2,1)>neighborBefore);
  assert.ok(w.temperatureAt(1,1)>25);
  close(r.energy+w.totalTileEnergy(),before,1e-10);
});

test('hot radiator creates natural convection field',()=>{
  const w=new World(7,7),r=new Radiator(3,3);r.energy=r.waterMass*4186*65;w.addEntity(r);
  const air=new AirflowSystem(w,metrics());air.buildVelocityField();
  const speeds=[];
  for(let y=1;y<=5;y++)for(let x=1;x<=5;x++)speeds.push(Math.hypot(w.airX[w.index(x,y)],w.airY[w.index(x,y)]));
  assert.ok(Math.max(...speeds)>0);
});

test('tank has gameplay-scale thermal mass instead of near-infinite one-ton buffer',()=>{
  const tank=new WaterTank(0,0);
  assert.equal(tank.waterMass,120);
});

test('placement validator prevents T-junctions in simple-loop fluid model',()=>{
  const w=new World(5,5);w.addEntity(new Pipe(1,2));w.addEntity(new Pipe(2,2));w.addEntity(new Pipe(3,2));
  const validator=new PlacementValidator(w);
  assert.equal(validator.canPlace('pipe',2,1),false);
});

test('machine heat travels through closed loop to radiator and room air',()=>{
  const w=new World(7,7),loop=addClosedLoop(w,{machine:true});
  const sys=new FluidSystem(w,metrics());
  const before=totalThermalEnergy(w),machineBefore=loop.machine.temperature,airBefore=w.temperatureAt(3,4);
  let peakRadiatorPower=0,peakDownstream=25;

  for(let i=0;i<1200;i++){
    sys.update(.05);
    peakRadiatorPower=Math.max(peakRadiatorPower,loop.radiator.thermalPower);
    peakDownstream=Math.max(peakDownstream,loop.p2.waterTemperature);
  }

  assert.ok(loop.machine.temperature<machineBefore);
  assert.ok(peakDownstream>25.2,'heat should propagate past the exchanger into downstream pipe');
  assert.ok(peakRadiatorPower>100,'radiator should reject measurable heat');
  assert.ok(w.temperatureAt(3,4)>airBefore,'room air around radiator should warm');
  close(totalThermalEnergy(w),before,1e-8);
});

test('closed-loop advection preserves fluid energy when there are no sources or sinks',()=>{
  const w=new World(6,6),loop=addClosedLoop(w);
  loop.hx.energy=loop.hx.waterMass*4186*70;
  const sys=new FluidSystem(w,metrics());
  sys.networks=sys.buildNetworks();for(const n of sys.networks)sys.solveNetwork(n);
  const before=loop.fluid.reduce((s,e)=>s+e.energy,0);
  for(let i=0;i<500;i++)for(const n of sys.networks)sys.transport(n,.05);
  const after=loop.fluid.reduce((s,e)=>s+e.energy,0);
  close(after,before,1e-10);
});
