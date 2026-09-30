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
import { ServerRack } from '../src/entities/ServerRack.js';
import { WATER_CP } from '../src/utils/Constants.js';
import { EnergySystem } from '../src/simulation/EnergySystem.js';
import { WaterChiller } from '../src/entities/WaterChiller.js';

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

const addParallelHydraulicLoop=world=>{
  const pump=new Pump(1,3,{x:1,y:0}),outlet=new Pipe(2,3),split=new Pipe(3,3),merge=new Pipe(7,3);
  const upper=[[3,2],[4,2],[5,2],[6,2],[7,2]].map(([x,y])=>new Pipe(x,y));
  const lower=[[3,4],[4,4],[5,4],[6,4],[7,4]].map(([x,y])=>new Pipe(x,y));
  const returnPath=[[8,3],[9,3],[9,4],[9,5],[9,6],[8,6],[7,6],[6,6],[5,6],[4,6],[3,6],[2,6],[1,6],[1,5],[1,4]].map(([x,y])=>new Pipe(x,y));
  const fluid=[pump,outlet,split,...upper, ...lower,merge,...returnPath];fluid.forEach(entity=>world.addEntity(entity));
  return {pump,outlet,split,upper,lower,merge,returnPath,fluid};
};

const totalThermalEnergy=(world)=>world.totalTileEnergy()+world.entities.reduce((sum,e)=>{
  if(e.isHeatMachine||['pipe','pump','tank','radiator','exchanger','waterChiller'].includes(e.type))return sum+(e.energy||0);
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
  const w=new World(7,5);w.setTemperature(6,2,60);const exhaust=new ExhaustFan(6,2,{x:1,y:0});w.addEntity(exhaust);const m=metrics(),sys=new AirflowSystem(w,m);
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
  assert.equal(loop.fluid.every(e=>e.circuitClosed&&Math.abs(e.flowRate-loop.pump.flowRate)<1e-10),true);
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

test('a single closed network with multiple pumps remains invalid',()=>{
  const world=new World(6,6),loop=addClosedLoop(world);world.removeEntity(loop.p1);
  const secondPump=new Pump(2,1,{x:0,y:1});world.addEntity(secondPump);
  const system=new FluidSystem(world,metrics());system.update(.05);
  assert.equal(system.networks[0].status,'MULTIPLE_PUMPS');
  assert.equal(loop.pump.flowRate,0);assert.equal(secondPump.flowRate,0);
});

test('closed T branches split pump flow by path resistance and mix on return without energy loss',()=>{
  const world=new World(12,9),loop=addParallelHydraulicLoop(world),system=new FluidSystem(world,metrics());
  const network=system.buildNetworks()[0];system.solveNetwork(network);
  assert.equal(network.status,'CLOSED');
  assert.equal(loop.split.circuitClosed,true);assert.equal(loop.merge.circuitClosed,true);
  assert.equal(loop.split.networkStatus,'CLOSED','valid T junctions are part of the hydraulic system');
  const splitFlows=network.links.filter(link=>link.from===loop.split).map(link=>link.flowRate);
  assert.equal(splitFlows.length,2);
  close(splitFlows[0],splitFlows[1],1e-8);
  close(splitFlows[0]+splitFlows[1],loop.pump.flowRate,1e-8);
  assert.ok(loop.pump.flowRate<=3.5);

  loop.upper[1].resistance=8;
  system.solveNetwork(network);
  const unequal=network.links.filter(link=>link.from===loop.split).map(link=>({link,flow:link.flowRate}));
  assert.equal(unequal.length,2);
  const upperFlow=unequal.find(item=>item.link.to===loop.upper[0]).flow;
  const lowerFlow=unequal.find(item=>item.link.to===loop.lower[0]).flow;
  assert.ok(upperFlow<lowerFlow,'the higher-resistance route receives less water');
  close(upperFlow+lowerFlow,loop.pump.flowRate,1e-8);

  const branchInlets=network.links.filter(link=>link.to===loop.merge);
  assert.equal(branchInlets.length,2);
  branchInlets[0].from.energy=branchInlets[0].from.waterMass*WATER_CP*60;
  branchInlets[1].from.energy=branchInlets[1].from.waterMass*WATER_CP*20;
  const mixed=branchInlets.reduce((sum,link)=>sum+link.flowRate*link.from.waterTemperature,0)/branchInlets.reduce((sum,link)=>sum+link.flowRate,0);
  const before=totalThermalEnergy(world);
  system.transport(network,.02);
  close(loop.merge.inletTemperature,mixed,1e-8);
  close(totalThermalEnergy(world),before,1e-10);
});

test('hydraulic branch flow respects the selectable pump maximum',()=>{
  const world=new World(6,6),loop=addClosedLoop(world);for(const entity of loop.fluid)entity.resistance=.01;
  const system=new FluidSystem(world,metrics());system.update(.05);
  assert.equal(loop.pump.flowRate,1.5);
  assert.ok(loop.fluid.every(entity=>entity.flowRate<=1.5+1e-10));
  loop.pump.flowMode='boost';system.networks[0].hydraulicSignature=null;system.update(.05);
  assert.equal(loop.pump.flowRate,2);
});

test('an open-ended branch remains an invalid circuit with no flow',()=>{
  const world=new World(12,9),loop=addParallelHydraulicLoop(world);
  const dangling=new Pipe(4,7);world.addEntity(dangling);
  const system=new FluidSystem(world,metrics());system.update(.05);
  const network=system.networks.find(item=>item.entities.includes(loop.pump));
  assert.equal(network.status,'OPEN_CIRCUIT');
  assert.equal(loop.pump.flowRate,0);
  assert.equal(dangling.flowRate,0);
});

test('sparse hydraulic solver keeps long closed circuits operational',()=>{
  const world=new World(40,30),pump=world.addEntity(new Pump(1,1,{x:1,y:0}));
  for(let x=2;x<40;x++)world.addEntity(new Pipe(x,1));
  for(let y=2;y<30;y++)world.addEntity(new Pipe(39,y));
  for(let x=38;x>=1;x--)world.addEntity(new Pipe(x,29));
  for(let y=28;y>=2;y--)world.addEntity(new Pipe(1,y));
  const system=new FluidSystem(world,metrics());system.update(.01);
  assert.equal(system.networks[0].status,'CLOSED');
  assert.ok(pump.flowRate>0);
  assert.equal(system.networks[0].links.length,system.networks[0].entities.length);
});

test('water exchanger transfers more heat directly from an adjacent rack with the stronger UA',()=>{
  const transferAt=ua=>{
    const w=new World(7,7),loop=addClosedLoop(w),rack=new ServerRack(4,1,{temperature:65,heatOutput:0,startAt:0});
    w.addEntity(rack);loop.hx.ua=ua;loop.hx.ratedCapacity=100000;
    const sys=new FluidSystem(w,metrics());sys.networks=sys.buildNetworks();for(const network of sys.networks)sys.solveNetwork(network);
    const before=totalThermalEnergy(w),rackEnergy=rack.energy,waterEnergy=loop.hx.energy;
    sys.exchangeMachines(.05);
    const rackHeatRemoved=rackEnergy-rack.energy;
    assert.ok(rackHeatRemoved>0);assert.ok(loop.hx.energy>waterEnergy);close(totalThermalEnergy(w),before,1e-10);
    return rackHeatRemoved;
  };
  assert.ok(transferAt(2250)>transferAt(1500));
});

test('rack heat capture uses rack generation, reports stream inlet/outlet and stays within exchanger rating',()=>{
  const world=new World(7,7),loop=addClosedLoop(world),rack=new ServerRack(4,1,{temperature:60,heatOutput:0,startAt:0});
  rack.heatGenerationPower=18000;world.addEntity(rack);
  const system=new FluidSystem(world,metrics()),before=totalThermalEnergy(world);system.update(.05);
  assert.equal(loop.hx.captureMode,'DIRECT_RACK');assert.ok(loop.hx.directCoolingPower>0);
  assert.ok(loop.hx.thermalPower<=loop.hx.ratedCapacity+1e-6);
  close(loop.hx.outletTemperature-loop.hx.inletTemperature,loop.hx.thermalPower/(loop.hx.flowRate*WATER_CP),1e-7);
  close(totalThermalEnergy(world),before,1e-10);
});

test('outdoor radiator sends rejected heat to the environment and respects its approach temperature',()=>{
  const world=new World(6,6),loop=addClosedLoop(world);loop.radiator.outdoor=true;for(const entity of loop.fluid)entity.energy=entity.waterMass*WATER_CP*60;
  const system=new FluidSystem(world,metrics()),before=totalThermalEnergy(world);system.update(.1);
  assert.ok(loop.radiator.thermalPower>0);assert.equal(loop.radiator.rejectedToExterior,true);
  assert.ok(loop.radiator.airInTemperature+loop.radiator.minimumApproach<=loop.radiator.inletTemperature+1e-8);
  close(totalThermalEnergy(world)+system.metrics.externalEnergy,before,1e-10);
});

test('water chiller cools circulating water to its target within capacity and returns Q plus compressor heat to the room',()=>{
  const world=new World(7,7),pump=new Pump(1,1,{x:1,y:0}),p1=new Pipe(2,1),hx=new HeatExchanger(3,1),chiller=new WaterChiller(3,2),radiator=new Radiator(3,3),p3=new Pipe(2,3),p4=new Pipe(1,3),p5=new Pipe(1,2),fluid=[pump,p1,hx,chiller,radiator,p3,p4,p5];
  pump.flowMode='boost';for(const entity of fluid){entity.energy=entity.waterMass*WATER_CP*30;world.addEntity(entity);}
  const system=new FluidSystem(world,metrics()),before=totalThermalEnergy(world);system.update(.05);
  assert.equal(system.networks[0].status,'CLOSED');assert.ok(chiller.coolingPower>0);assert.ok(chiller.coolingPower<=chiller.ratedCapacity);
  close(chiller.power,chiller.coolingPower/chiller.cop,1e-8);close(chiller.rejectedHeatPower,chiller.coolingPower+chiller.power,1e-8);
  close(chiller.inletTemperature-chiller.outletTemperature,chiller.coolingPower/(chiller.flowRate*WATER_CP),1e-7);
  close(totalThermalEnergy(world),before,1e-10);
});

test('water chiller requires a powered closed water circuit',()=>{
  const world=new World(5,3),chiller=new WaterChiller(2,1);chiller.energy=chiller.waterMass*WATER_CP*40;world.addEntity(chiller);
  const system=new FluidSystem(world,metrics());system.update(.05);
  assert.equal(chiller.coolingPower,0);assert.equal(chiller.power,0);
});

test('a circulating exchanger captures nearby hot-aisle air into water without creating energy',()=>{
  const w=new World(7,7),loop=addClosedLoop(w);
  w.setTemperature(4,1,55);w.setTemperature(3,0,45);
  const sys=new FluidSystem(w,metrics());
  sys.networks=sys.buildNetworks();for(const network of sys.networks)sys.solveNetwork(network);
  const before=totalThermalEnergy(w),hotBefore=w.temperatureAt(4,1),secondBefore=w.temperatureAt(3,0),waterBefore=loop.hx.waterTemperature;
  sys.exchangeMachines(.05);
  assert.ok(loop.hx.airCoolingPower>0);
  assert.ok(w.temperatureAt(4,1)<hotBefore&&w.temperatureAt(3,0)<secondBefore);
  assert.ok(loop.hx.waterTemperature>waterBefore);
  close(totalThermalEnergy(w),before,1e-10);
});

test('stronger water exchanger UA removes more heat from nearby hot aisle air',()=>{
  const transferAt=airUA=>{
    const w=new World(7,7),loop=addClosedLoop(w);loop.hx.airUA=airUA;loop.hx.airRatedCapacity=100000;
    w.setTemperature(4,1,55);w.setTemperature(3,0,45);
    const sys=new FluidSystem(w,metrics());sys.networks=sys.buildNetworks();for(const network of sys.networks)sys.solveNetwork(network);
    const before=totalThermalEnergy(w);sys.exchangeMachines(.05);
    assert.ok(loop.hx.airCoolingPower>0);close(totalThermalEnergy(w),before,1e-10);
    return loop.hx.airCoolingPower;
  };
  assert.ok(transferAt(2250)>transferAt(1500));
});

test('rack exhaust heat reaches circulating water through the hot aisle',()=>{
  const w=new World(7,7),loop=addClosedLoop(w),rack=new ServerRack(4,2,{temperature:65,heatOutput:0,startAt:0,airExhaustDirection:{x:0,y:-1}});
  w.addEntity(rack);
  const thermal=new ThermalSystem(w,metrics()),fluid=new FluidSystem(w,metrics());
  fluid.networks=fluid.buildNetworks();for(const network of fluid.networks)fluid.solveNetwork(network);
  const before=totalThermalEnergy(w),waterBefore=loop.hx.energy;
  thermal.exchangeServerRack(rack,.05);
  assert.ok(w.temperatureAt(4,1)>25);
  fluid.exchangeMachines(.05);
  assert.ok(loop.hx.airCoolingPower>0);
  assert.ok(loop.hx.energy>waterBefore);
  close(totalThermalEnergy(w),before,1e-10);
});

test('zero-time fluid diagnostics never report invalid thermal power',()=>{
  const w=new World(7,7),loop=addClosedLoop(w,{machine:true});
  const sys=new FluidSystem(w,metrics());sys.update(0);
  assert.equal(loop.hx.thermalPower,0);
  assert.equal(loop.radiator.thermalPower,0);
});

test('exchanger air pickup cannot cross a wall or run without water circulation',()=>{
  const w=new World(7,7),loop=addClosedLoop(w);
  w.setMaterial(4,1,'concrete');w.setTemperature(5,1,60);
  const sys=new FluidSystem(w,metrics()),before=w.temperatureAt(5,1);
  sys.update(.05);
  assert.equal(loop.hx.airCoolingPower,0);close(w.temperatureAt(5,1),before);
  w.setMaterial(4,1,'air');w.setTemperature(4,1,60);loop.pump.enabled=false;
  sys.update(.05);
  assert.equal(loop.hx.airCoolingPower,0);
});

test('hot water does not reheat adjacent racks or hot-aisle air through a cooling exchanger',()=>{
  const w=new World(7,7),loop=addClosedLoop(w,{machine:true});
  loop.hx.energy=loop.hx.waterMass*4186*70;
  loop.machine.energy=loop.machine.mass*loop.machine.heatCapacity*40;
  w.setTemperature(3,0,40);
  const sys=new FluidSystem(w,metrics());sys.networks=sys.buildNetworks();for(const network of sys.networks)sys.solveNetwork(network);
  const machineBefore=loop.machine.energy,airBefore=w.temperatureAt(3,0);
  sys.exchangeMachines(.05);
  assert.equal(loop.hx.thermalPower,0);
  close(loop.machine.energy,machineBefore);close(w.temperatureAt(3,0),airBefore);
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

test('placement validator allows T-junctions but rejects a fourth pipe connection',()=>{
  const w=new World(5,5);w.addEntity(new Pipe(1,2));w.addEntity(new Pipe(2,2));w.addEntity(new Pipe(3,2));
  const validator=new PlacementValidator(w);
  assert.equal(validator.canPlace('pipe',2,1),true);
  w.addEntity(new Pipe(2,1));
  assert.equal(validator.canPlace('pipe',2,3),false);
});

test('radiator air-coil exchange follows open paths and cannot transfer across two blocked faces',()=>{
  const world=new World(5,5),radiator=new Radiator(2,2);radiator.energy=radiator.waterMass*WATER_CP*70;
  world.setMaterial(1,2,'concrete');world.setMaterial(2,1,'concrete');world.addEntity(radiator);
  const blockedBefore=world.temperatureAt(1,1),reachableBefore=world.temperatureAt(3,3),fluid=new FluidSystem(world,metrics());fluid.radiate(.1);
  assert.equal(world.temperatureAt(1,1),blockedBefore);
  assert.ok(world.temperatureAt(3,3)>reachableBefore);
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

test('a correctly sized loop stabilizes a continuous rack heat load and sends it outdoors',()=>{
  const world=new World(9,8),loop=addClosedLoop(world),rack=new ServerRack(4,1,{temperature:55,heatOutput:0,startAt:0}),systemMetrics=metrics();
  loop.radiator.outdoor=true;rack.heatGenerationPower=10000;world.addEntity(rack);
  const fluid=new FluidSystem(world,systemMetrics),before=totalThermalEnergy(world);let generated=0;
  for(let i=0;i<10000;i++){const heat=rack.heatGenerationPower*.05;rack.energy+=heat;generated+=heat;fluid.update(.05);}
  assert.ok(rack.temperature<40,`rack stabilized at ${rack.temperature.toFixed(1)} °C`);
  assert.ok(loop.radiator.thermalPower>0);
  close(totalThermalEnergy(world)+systemMetrics.externalEnergy,before+generated,1e-8);
});

test('energy accounting includes every water component, including non-powered pipes and exchangers',()=>{
  const world=new World(6,6),loop=addClosedLoop(world),energy=new EnergySystem(world,metrics());
  const expected=world.totalTileEnergy()+loop.fluid.reduce((sum,entity)=>sum+entity.energy,0);
  assert.equal(energy.totalInternalEnergy(),expected);
});
