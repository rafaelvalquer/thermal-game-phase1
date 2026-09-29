import test from 'node:test';
import assert from 'node:assert/strict';
import { AirTestScenarios } from '../../src/simulation/air/AirTestScenarios.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { AIR } from '../../src/simulation/air/AirConstants.js';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { Simulation } from '../../src/simulation/Simulation.js';

function fanScenario(name){
  if(name==='open')return AirTestScenarios.openFan();
  if(name==='corridor')return AirTestScenarios.straightDuct({length:20,width:5});
  if(name==='bend')return AirTestScenarios.bend90();
  if(name==='obstacle')return AirTestScenarios.obstacle();
  return AirTestScenarios.twoFansSeries();
}

function settleFan(name,adaptive){
  const {world,fan}=fanScenario(name),airflow=new AirflowSystem(world,{});airflow.pressure.adaptive=adaptive;
  let iterations=0;
  for(let tick=0;tick<120;tick++){airflow.updateVelocity(.05);iterations+=airflow.pressure.iterationsUsed;}
  return {fanFlow:fan.currentFlow,divergence:world.airDiagnostics.maxDivergence,pressure:world.airPressure.slice(0,world.size),iterations:iterations/120};
}

function coolingScenario(tier,adaptive){
  const world=new World(16,10),unit=world.addEntity(new CoolingUnit(1,4,{tier})),vent=world.addEntity(new SupplyVent(5,4,{direction:{x:1,y:0}}));
  for(let x=2;x<=4;x++)world.addUtility(new AirDuct(x,4,{size:'duct'}));
  const rack=world.addEntity(new ServerRack(9,5,{startAt:0,maxPowerKW:8,currentPowerKW:8,heatOutputKW:7.84,temperature:28,slaTemperature:30}));
  const simulation=new Simulation(world,{id:`adaptive-${tier}`,map:{width:world.width,height:world.height},thermalSystems:{simpleCooling:true,waterCooling:false},missionDuration:Infinity,objectives:[],failures:[],events:[],powerLimit:1e9});
  simulation.initialize();simulation.airflow.pressure.adaptive=adaptive;
  for(let tick=0;tick<40;tick++)simulation.update(.05);
  return {rackTemperature:rack.temperature,airTemperature:world.temperatureAt(8,5),powerEnergy:simulation.metrics.powerEnergy,coolingDelivered:simulation.metrics.coolingDelivered,slaMet:rack.temperature<=rack.slaTemperature,flow:vent.flowRate};
}

test('adaptive pressure matches fixed 40-iteration fan fields across open, corridor, bend, obstacle, and dual-fan layouts',()=>{
  const previous=AIR.pressureTolerance;AIR.pressureTolerance=.5;
  try{
    for(const name of ['open','corridor','bend','obstacle','two fans']){
      const fixed=settleFan(name,false),adaptive=settleFan(name,true),pressureDiff=Math.max(...fixed.pressure.map((value,index)=>Math.abs(value-adaptive.pressure[index])));
      assert.ok(Math.abs(adaptive.fanFlow-fixed.fanFlow)<Math.max(.01,fixed.fanFlow*.01),`${name}: fan flow mismatch`);
      assert.ok(Math.abs(adaptive.divergence-fixed.divergence)<.02,`${name}: divergence mismatch`);
      assert.ok(adaptive.divergence<1.5,`${name}: projected divergence ${adaptive.divergence}`);
      assert.ok(pressureDiff<.06,`${name}: pressure field differs by ${pressureDiff} Pa`);
      assert.ok(adaptive.iterations<=24,`${name}: expected early convergence, averaged ${adaptive.iterations}`);
    }
  }finally{AIR.pressureTolerance=previous;}
});

test('adaptive pressure preserves rack, power, cooling, and SLA outcomes for commercial and industrial cooling',()=>{
  const previous=AIR.pressureTolerance;AIR.pressureTolerance=.5;
  try{
    for(const tier of ['commercial','industrial']){
      const fixed=coolingScenario(tier,false),adaptive=coolingScenario(tier,true);
      assert.ok(fixed.flow>0&&adaptive.flow>0,`${tier}: cooling flow missing`);
      assert.ok(Math.abs(adaptive.rackTemperature-fixed.rackTemperature)<.1,`${tier}: rack temperature mismatch`);
      assert.ok(Math.abs(adaptive.airTemperature-fixed.airTemperature)<.1,`${tier}: air temperature mismatch`);
      assert.ok(Math.abs(adaptive.powerEnergy-fixed.powerEnergy)<Math.max(1,fixed.powerEnergy*.01),`${tier}: power mismatch`);
      assert.ok(Math.abs(adaptive.coolingDelivered-fixed.coolingDelivered)<Math.max(1,fixed.coolingDelivered*.02),`${tier}: cooling mismatch`);
      assert.equal(adaptive.slaMet,fixed.slaMet,`${tier}: SLA state mismatch`);
    }
  }finally{AIR.pressureTolerance=previous;}
});
