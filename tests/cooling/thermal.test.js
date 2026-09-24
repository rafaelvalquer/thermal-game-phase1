import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { CoolingSystem } from '../../src/simulation/cooling/CoolingSystem.js';
import { CoolingHeatRejection } from '../../src/simulation/cooling/CoolingHeatRejection.js';
import { EnergySystem } from '../../src/simulation/EnergySystem.js';
import { FailureSystem } from '../../src/campaign/FailureSystem.js';
import { MissionEventSystem } from '../../src/campaign/MissionEventSystem.js';
import { CoolingPerformanceSolver } from '../../src/simulation/cooling/CoolingPerformanceSolver.js';

function warmScenario({indoorUnit=false,outdoorTemperature=25}={}){
  const world=new World(8,8);world.environment.temperature=outdoorTemperature;
  world.zones=[{id:'room',x:3,y:1,width:5,height:6}];
  for(let y=1;y<7;y++)for(let x=3;x<8;x++)world.setTemperature(x,y,30);
  const unit=new CoolingUnit(indoorUnit?3:0,4);world.addEntity(unit);
  world.addUtility(new AirDuct(indoorUnit?4:1,4,{size:'duct'}));
  world.addUtility(new AirDuct(indoorUnit?5:2,4,{size:'duct'}));
  const vent=new SupplyVent(indoorUnit?6:3,4);world.addEntity(vent);
  const metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0};
  const airflow=new AirflowSystem(world,metrics),cooling=new CoolingSystem(world,airflow,metrics),energy=new EnergySystem(world,metrics);energy.initialize();
  return {world,unit,vent,metrics,airflow,cooling,energy};
}

test('an indoor condenser distributes rejected heat across reachable nearby air and conserves energy',()=>{
  const world=new World(9,9),unit=new CoolingUnit(4,4);unit.indoor=true;unit.electricalPower=300;world.addEntity(unit);
  const metrics={generatedHeat:0,externalEnergy:0,coolingHeatRejected:0},before=world.totalTileEnergy();
  const rejection=new CoolingHeatRejection(world,metrics);rejection.queue(unit,1200);rejection.apply(2);
  const warmed=Array.from(world.energy).filter((energy,index)=>energy>before/world.size);
  assert.ok(warmed.length>1,'heat should be shared by several air cells');
  assert.ok(Math.abs(world.totalTileEnergy()-before-2400)<1e-8);
  assert.equal(metrics.externalEnergy,0);
  assert.equal(metrics.generatedHeat,600);
  assert.equal(metrics.coolingHeatRejected,1200);
  assert.ok(world.temperatureAt(4,4)>25);
  assert.ok(world.temperatureAt(5,4)>25);
});

test('nearby solid walls block condenser heat distribution without blocking reachable air',()=>{
  const world=new World(9,9),unit=new CoolingUnit(3,4);unit.indoor=true;world.addEntity(unit);
  world.setMaterial(4,4,'concrete');
  const before=world.totalTileEnergy(),targetBefore=world.energy[world.index(5,4)];
  const metrics={generatedHeat:0,externalEnergy:0,coolingHeatRejected:0},rejection=new CoolingHeatRejection(world,metrics);
  rejection.queue(unit,1000);rejection.apply(1);
  assert.equal(world.energy[world.index(5,4)],targetBefore,'air behind the wall should remain unchanged');
  assert.ok(world.temperatureAt(3,3)>25,'visible nearby air should receive heat');
  assert.ok(Math.abs(world.totalTileEnergy()-before-1000)<1e-8);
});

test('condenser exhaust direction biases heat toward the selected side and across all four orientations',()=>{
  for(const direction of [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}]){
    const world=new World(9,9),unit=new CoolingUnit(4,4,{direction});unit.indoor=true;world.addEntity(unit);
    const metrics={generatedHeat:0,externalEnergy:0,coolingHeatRejected:0},before=world.totalTileEnergy(),rejection=new CoolingHeatRejection(world,metrics);
    rejection.queue(unit,1200);rejection.apply(1);
    const forward=world.temperatureAt(4+direction.x,4+direction.y),backward=world.temperatureAt(4-direction.x,4-direction.y);
    assert.ok(forward>backward,'exhaust should favor the chosen direction');
    assert.ok(Math.abs(world.totalTileEnergy()-before-1200)<1e-8,'direction must not change rejected energy');
  }
});

test('condenser exhaust impulse follows its direction and stops at a wall',()=>{
  const world=new World(8,5),unit=new CoolingUnit(2,2,{direction:{x:1,y:0}});unit.indoor=true;world.addEntity(unit);
  const airflow=new AirflowSystem(world,{});
  unit.heatRejected=20000;
  world.setMaterial(3,2,'concrete');airflow.grid.syncTopology();
  airflow.updateVelocity(.05);
  assert.equal(airflow.grid.u[airflow.grid.uIndex(3,2)],0,'airflow must not be pushed into a wall');
  world.setMaterial(3,2,'air');airflow.grid.syncTopology();airflow.updateVelocity(.05);
  assert.ok(airflow.grid.u[airflow.grid.uIndex(3,2)]>0,'air should be pushed forward when the path is clear');
});

test('pressure projection preserves a visible directional condenser jet for streamline rendering',()=>{
  const world=new World(12,8),unit=new CoolingUnit(2,3,{direction:{x:1,y:0}});unit.indoor=true;unit.heatRejected=20000;world.addEntity(unit);
  const airflow=new AirflowSystem(world,{});
  for(let step=0;step<3;step++)airflow.updateVelocity(.05);
  assert.ok(world.airX[world.index(3,3)]>.08,'outlet airflow should remain visible outside the condenser');
  assert.ok(world.airX[world.index(4,3)]>.08,'outlet should carry airflow downstream');
});

test('rejected heat with no accessible indoor air is exported to the environment',()=>{
  const world=new World(5,5),unit=new CoolingUnit(2,2);unit.indoor=true;world.addEntity(unit);
  world.fill('concrete',25);
  const metrics={generatedHeat:0,externalEnergy:0,coolingHeatRejected:0},before=world.totalTileEnergy();
  const rejection=new CoolingHeatRejection(world,metrics);rejection.queue(unit,1000);rejection.apply(2);
  assert.equal(world.totalTileEnergy(),before);
  assert.equal(world.environment.energyReceived,2000);
  assert.equal(metrics.externalEnergy,2000);
});

test('cold air enters the room physically and outdoor heat rejection conserves energy',()=>{
  const s=warmScenario(),before=s.energy.totalInternalEnergy(),roomBefore=s.world.temperatureAt(s.vent.x,s.vent.y);
  s.cooling.update(1);s.airflow.updateVelocity(1);s.cooling.exchangeRooms(1);s.energy.update(1);
  assert.ok(s.unit.actualRoomCooling>0);
  assert.ok(s.world.temperatureAt(s.vent.x,s.vent.y)<roomBefore);
  assert.equal(s.unit.indoor,false);
  assert.ok(Math.abs(s.unit.heatRejected-(s.unit.currentCooling+s.unit.electricalPower))<1e-6);
  assert.ok(Math.abs(s.metrics.energyBalance)<1e-5);
  assert.ok(s.world.environment.energyReceived>0);
  assert.ok(s.energy.totalInternalEnergy()<before);
});

test('rotating a cold-air outlet applies airflow momentum in its selected direction',()=>{
  for(const {direction,axis,face} of [
    {direction:{x:1,y:0},axis:'u',face:(grid,vent)=>grid.u[grid.uIndex(vent.x+1,vent.y)]},
    {direction:{x:0,y:1},axis:'v',face:(grid,vent)=>grid.v[grid.vIndex(vent.x,vent.y+1)]},
  ]){
    const world=new World(10,8);world.zones=[{id:'room',x:4,y:1,width:6,height:6}];
    for(let y=1;y<7;y++)for(let x=4;x<10;x++)world.setTemperature(x,y,32);
    const unit=new CoolingUnit(1,3),vent=new SupplyVent(4,3,{direction});world.addEntity(unit);
    world.addUtility(new AirDuct(2,3,{size:'duct'}));world.addUtility(new AirDuct(3,3,{size:'duct'}));world.addEntity(vent);
    const airflow=new AirflowSystem(world,{}),cooling=new CoolingSystem(world,airflow,{});
    cooling.update(.1);
    assert.ok(vent.flowRate>0,axis+' direction received no cooling flow');
    assert.ok(face(airflow.grid,vent)>0,axis+' outlet failed to inject momentum in its selected direction');
  }
});

test('an indoor cooling unit returns its rejected heat to the same building',()=>{
  const s=warmScenario({indoorUnit:true}),before=s.energy.totalInternalEnergy();
  s.cooling.update(1);s.airflow.updateVelocity(1);s.cooling.exchangeRooms(1);s.energy.update(1);
  assert.equal(s.unit.indoor,true);
  assert.equal(s.metrics.externalEnergy,0);
  assert.ok(Math.abs((s.energy.totalInternalEnergy()-before)-s.unit.electricalPower)<1e-5);
  assert.ok(Math.abs(s.metrics.energyBalance)<1e-5);
});

test('hot outdoor conditions reduce available cooling capacity',()=>{
  const s=warmScenario({outdoorTemperature:40});s.cooling.update(1);
  assert.ok(s.unit.availableCapacity<25000);
  assert.ok(s.unit.availableCapacity>=25000*.65);
});

test('outdoor derating matches the design points at 25, 30, 35 and 40 degrees',()=>{
  const solver=new CoolingPerformanceSolver();
  assert.deepEqual([25,30,35,40].map(t=>solver.outdoorFactor(t)),[1,.95,.85,.7]);
  assert.equal(solver.outdoorFactor(60),.65);
});

test('a connected unit at rest remains ready for active-unit mission objectives',()=>{
  const unit=new CoolingUnit(0,0),network={status:'READY',paths:[{flowRate:2.5}]};
  const result=new CoolingPerformanceSolver().solve(unit,network,12);
  assert.equal(result.cooling,0);
  assert.equal(result.status,'READY');
});

test('cooling diagnostics leave total electrical demand to the energy-system aggregator',()=>{
  const s=warmScenario();s.metrics.powerDraw=9000;s.cooling.update(1);
  assert.equal(s.metrics.powerDraw,9000);
});

test('a hot room pushes the unit into overload while keeping cooling physically capped',()=>{
  const s=warmScenario();for(let y=1;y<7;y++)for(let x=3;x<8;x++)s.world.setTemperature(x,y,60);
  s.cooling.update(1);
  assert.equal(s.unit.status,'OVERLOAD');
  assert.ok(s.unit.coolingLoad<=s.unit.availableCapacity);
  assert.ok(s.unit.loadRatio>=1);
});

test('disabled and restored units change only their own cooling output',()=>{
  const world=new World(12,8);world.zones=[{id:'room',x:2,y:0,width:10,height:8}];
  const units=[];
  for(const y of [1,5]){const unit=new CoolingUnit(0,y);world.addEntity(unit);world.addUtility(new AirDuct(1,y,{size:'duct'}));world.addUtility(new AirDuct(2,y,{size:'duct'}));world.addEntity(new SupplyVent(3,y));units.push(unit);}
  const metrics={generatedHeat:0,externalEnergy:0},airflow=new AirflowSystem(world,metrics),system=new CoolingSystem(world,airflow,metrics);
  units[0].enabled=false;system.update(1);
  assert.equal(units[0].status,'OFF');assert.equal(units[0].currentAirFlow,0);assert.ok(units[1].currentAirFlow>0);
  units[0].enabled=true;world.environment.temperature=35;system.update(1);
  assert.ok(units[0].availableCapacity<25000);
  assert.ok(units[1].availableCapacity<25000);
});

test('cooling overload uses a hold timer and cooling-unit failure events can be restored',()=>{
  const world=new World(4,4),unit=new CoolingUnit(1,1),other=new CoolingUnit(2,2);unit.missionId='ac-1';other.missionId='ac-2';world.addEntity(unit);world.addEntity(other);unit.status='OVERLOAD';
  const failures=new FailureSystem(world,{failures:[{type:'coolingUnitOverload',hold:2}]});
  assert.equal(failures.update(1).failed,false);assert.equal(failures.update(1).failed,true);
  const events=new MissionEventSystem(world,{events:[
    {time:1,type:'coolingUnitFailure',unitId:'ac-1',message:'AC-1 falhou'},
    {time:2,type:'coolingUnitRestore',unitId:'ac-1',message:'AC-1 restaurada'},
  ]});
  events.update(1);assert.equal(unit.enabled,false);assert.equal(other.enabled,true);events.update(2);assert.equal(unit.enabled,true);assert.equal(other.enabled,true);
});
