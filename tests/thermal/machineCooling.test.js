import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Machine } from '../../src/entities/Machine.js';
import { Fan } from '../../src/entities/Fan.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { ThermalSystem } from '../../src/simulation/ThermalSystem.js';

function coolingAtLimit(fans,heatOutput){
  const world=new World(24,15),machine=world.addEntity(new Machine(6,7,{heatOutput,temperature:40,startAt:0}));
  if(fans>0)world.addEntity(new Fan(5,7));
  if(fans>1)world.addEntity(new Fan(5,8));
  const metrics={generatedHeat:0,externalEnergy:0},air=new AirflowSystem(world,metrics),thermal=new ThermalSystem(world,metrics);
  for(let i=0;i<360;i++)air.updateVelocity(.05);
  // Prescribed 25 C inlet isolates convection capacity from room heat rejection.
  const before=world.totalTileEnergy()+machine.energy;
  thermal.applyHeatSources(.05,10);thermal.exchangeMachines(.05);
  assert.ok(Math.abs(world.totalTileEnergy()+machine.energy-before-metrics.generatedHeat)<1e-6);
  return machine;
}

test('airflow significantly increases machine cooling and reports the signed thermal balance',()=>{
  const passive=coolingAtLimit(0,8000),forced=coolingAtLimit(1,8000);
  assert.ok(forced.coolingPower>passive.coolingPower*5);
  assert.equal(forced.heatGenerationPower,8000);
  assert.equal(forced.thermalBalance,forced.coolingPower-8000);
  assert.ok(forced.thermalBalance>0);
});

test('12 kW is near the single fan limit; 15 kW needs stronger ventilation',()=>{
  const medium=coolingAtLimit(1,12000),large=coolingAtLimit(1,15000),two=coolingAtLimit(2,15000);
  assert.ok(Math.abs(medium.thermalBalance)<3000,medium.thermalBalance);
  assert.ok(large.thermalBalance<0,large.thermalBalance);
  assert.ok(two.thermalBalance>0,two.thermalBalance);
  assert.ok(two.coolingPower>large.coolingPower*1.2);
});

test('fan in a closed room redistributes heat without exporting energy',()=>{
  const world=new World(14,10);
  for(let x=0;x<14;x++){world.setMaterial(x,0,'concrete');world.setMaterial(x,9,'concrete');}
  for(let y=0;y<10;y++){world.setMaterial(0,y,'concrete');world.setMaterial(13,y,'concrete');}
  world.addEntity(new Fan(4,5));world.addEntity(new Machine(5,5,{startAt:0}));
  const metrics={generatedHeat:0,externalEnergy:0},air=new AirflowSystem(world,metrics),thermal=new ThermalSystem(world,metrics);
  const total=()=>world.totalTileEnergy()+world.entities.filter(e=>e.isHeatMachine).reduce((s,e)=>s+e.energy,0),before=total();
  for(let i=0;i<400;i++){air.updateVelocity(.05);thermal.update(.05,i*.05);air.advectHeat(.05);}
  assert.equal(metrics.externalEnergy,0);
  assert.ok(total()>before);
  assert.ok(Math.abs(total()-before-metrics.generatedHeat)<.001);
});

test('warm surrounding air reports negative cooling and disabled load generates no heat',()=>{
  const world=new World(5,5);world.fill('air',50);
  const machine=world.addEntity(new Machine(2,2,{temperature:25,startAt:0,loadMultiplier:0}));
  const metrics={generatedHeat:0,externalEnergy:0},thermal=new ThermalSystem(world,metrics);
  thermal.applyHeatSources(.05,10);thermal.exchangeMachines(.05);
  assert.equal(machine.heatGenerationPower,0);assert.equal(metrics.generatedHeat,0);
  assert.ok(machine.coolingPower<0);assert.equal(machine.thermalBalance,machine.coolingPower);
  assert.ok(machine.temperature>25);
});
