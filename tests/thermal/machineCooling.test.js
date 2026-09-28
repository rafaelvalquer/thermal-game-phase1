import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Machine } from '../../src/entities/Machine.js';
import { Fan } from '../../src/entities/Fan.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
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

test('directed rack exchange cools from its intake, heats the opposite exhaust, and conserves energy',()=>{
  const world=new World(8,8),rack=world.addEntity(new ServerRack(3,3,{temperature:40,heatOutput:0,startAt:0}));
  world.setTemperature(3,2,18);world.setTemperature(3,4,25);
  const inlet=world.index(3,2);world.airY[inlet]=-.4;
  const metrics={generatedHeat:0,externalEnergy:0},thermal=new ThermalSystem(world,metrics);
  const before=world.totalTileEnergy()+rack.energy,intakeBefore=world.temperatureAt(3,2),exhaustBefore=world.temperatureAt(3,4),rackBefore=rack.temperature;
  thermal.exchangeServerRack(rack,.1);
  assert.ok(rack.temperature<rackBefore,'cold intake air removes heat from the rack');
  assert.ok(world.temperatureAt(3,4)>exhaustBefore,'rack heat is delivered to its hot-side exhaust');
  assert.equal(world.temperatureAt(3,2),intakeBefore,'heat leaves through the opposite face');
  assert.ok(Math.abs(world.totalTileEnergy()+rack.energy-before)<1e-6,'rack-to-air exchange conserves energy');
  assert.ok(rack.coolingPower>0);
});

test('rack intake and exhaust faces always remain opposite and expose directional airflow',()=>{
  const rack=new ServerRack(3,3,{airIntakeDirection:{x:1,y:0},airExhaustDirection:{x:1,y:0}});
  assert.deepEqual(rack.airIntakeDirection,{x:1,y:0});
  assert.deepEqual(rack.airExhaustDirection,{x:-1,y:0});
  const world=new World(8,8);world.addEntity(rack);
  world.setTemperature(4,3,24);world.setTemperature(2,3,38);
  world.airX[world.index(4,3)]=-.4; // Toward the rack's east intake face.
  world.airX[world.index(2,3)]=-.3; // Away from the rack's west exhaust face.
  const thermal=new ThermalSystem(world,{generatedHeat:0,externalEnergy:0});
  thermal.exchangeServerRack(rack,.05);
  assert.equal(rack.intakeAirTemperature,24);
  assert.equal(rack.exhaustAirTemperature,38);
  assert.ok(rack.intakeAirVelocity>.39&&rack.intakeAirVelocity<.41);
  assert.ok(rack.intakeAirFlow>.49&&rack.intakeAirFlow<.51);
  assert.ok(rack.exhaustAirVelocity>.29&&rack.exhaustAirVelocity<.31);
  assert.ok(rack.exhaustAirFlow>.37&&rack.exhaustAirFlow<.38);
});

test('faster airflow removes rack heat sooner through forced convection',()=>{
  const coolingAtSpeed=speed=>{
    const world=new World(8,8),rack=world.addEntity(new ServerRack(3,3,{temperature:40,heatOutput:0,startAt:0}));
    world.setTemperature(3,2,25);world.setTemperature(3,4,25);
    world.airY[world.index(3,2)]=-speed;
    const thermal=new ThermalSystem(world,{generatedHeat:0,externalEnergy:0});
    const before=world.totalTileEnergy()+rack.energy;
    thermal.exchangeServerRack(rack,.1);
    assert.ok(Math.abs(world.totalTileEnergy()+rack.energy-before)<1e-6);
    return rack.coolingPower;
  };
  assert.ok(coolingAtSpeed(1.2)>coolingAtSpeed(.2));
});
