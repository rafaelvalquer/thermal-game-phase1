import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { Simulation } from '../../src/simulation/Simulation.js';

function run(speed,durationSeconds=1){
  const world=new World(16,10),unit=world.addEntity(new CoolingUnit(1,4)),vent=world.addEntity(new SupplyVent(5,4,{direction:{x:1,y:0}}));
  for(let x=2;x<=4;x++)world.addUtility(new AirDuct(x,4,{size:'duct'}));
  const rack=world.addEntity(new ServerRack(9,5,{startAt:0,maxPowerKW:8,currentPowerKW:8,heatOutputKW:7.84,temperature:28,slaTemperature:30}));
  const metrics={},simulation=new Simulation(world,{id:'speed-equivalence',map:{width:world.width,height:world.height},thermalSystems:{simpleCooling:true,waterCooling:false},missionDuration:Infinity,objectives:[],failures:[],events:[],powerLimit:1e9});
  simulation.initialize();simulation.setSpeed(speed);
  let frames=0;
  while(simulation.visualTime<durationSeconds-1e-9){
    const remaining=durationSeconds-simulation.visualTime,frameSeconds=Math.min(1/60,remaining/speed);
    simulation.update(frameSeconds);frames++;assert.ok(frames<durationSeconds*60/speed+200,`${speed}x did not finish ${durationSeconds} simulated seconds`);
  }
  return {rackTemperature:rack.temperature,airTemperature:world.temperatureAt(8,5),powerEnergy:simulation.metrics.powerEnergy,coolingDelivered:simulation.metrics.coolingDelivered,slaMet:rack.temperature<=rack.slaTemperature,ventFlow:vent.flowRate,unit};
}

test('1x, 2x, 4x, and 8x preserve one-second cooling and rack outcomes within tolerance',()=>{
  const baseline=run(1);
  assert.ok(baseline.ventFlow>0);
  for(const speed of [2,4,8]){
    const result=run(speed);
    assert.ok(Math.abs(result.rackTemperature-baseline.rackTemperature)<.25,`${speed}x rack ${result.rackTemperature}°C vs ${baseline.rackTemperature}°C`);
    assert.ok(Math.abs(result.airTemperature-baseline.airTemperature)<.3,`${speed}x air ${result.airTemperature}°C vs ${baseline.airTemperature}°C`);
    assert.ok(Math.abs(result.powerEnergy-baseline.powerEnergy)<Math.max(1,baseline.powerEnergy*.025),`${speed}x power-energy deviation`);
    assert.ok(Math.abs(result.coolingDelivered-baseline.coolingDelivered)<Math.max(1,baseline.coolingDelivered*.04),`${speed}x cooling deviation`);
    assert.equal(result.slaMet,baseline.slaMet,`${speed}x SLA state differs`);
  }
});

test('1x, 2x, 4x, and 8x preserve 60-second rack, air, energy, cooling, and SLA outcomes',()=>{
  const baseline=run(1,60);
  for(const speed of [2,4,8]){
    const result=run(speed,60);
    assert.ok(Math.abs(result.rackTemperature-baseline.rackTemperature)<.5,`${speed}x rack ${result.rackTemperature}°C vs ${baseline.rackTemperature}°C`);
    assert.ok(Math.abs(result.airTemperature-baseline.airTemperature)<.6,`${speed}x air ${result.airTemperature}°C vs ${baseline.airTemperature}°C`);
    assert.ok(Math.abs(result.powerEnergy-baseline.powerEnergy)<Math.max(1,baseline.powerEnergy*.025),`${speed}x power-energy deviation`);
    assert.ok(Math.abs(result.coolingDelivered-baseline.coolingDelivered)<Math.max(1,baseline.coolingDelivered*.05),`${speed}x cooling deviation`);
    assert.equal(result.slaMet,baseline.slaMet,`${speed}x SLA state differs`);
  }
});
