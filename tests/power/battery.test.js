import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Fan } from '../../src/entities/Fan.js';
import { PowerBattery } from '../../src/entities/PowerBattery.js';
import { BatteryDispatchSystem } from '../../src/simulation/BatteryDispatchSystem.js';
import { Simulation } from '../../src/simulation/Simulation.js';
import { BuildSystem } from '../../src/building/BuildSystem.js';
import { DataCenterManager } from '../../src/datacenter/DataCenterManager.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { PowerGridSystem } from '../../src/datacenter/PowerGridSystem.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { SolarPanel, solarIrradiance } from '../../src/entities/SolarPanel.js';

const level={id:'battery-test',thermalSystems:{simpleCooling:false,waterCooling:false},objectives:[],failures:[],events:[],missionDuration:Infinity,powerLimit:100000};
const metrics=()=>({generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0});

test('battery charges only from spare capacity, respects rate, capacity and cycle losses',()=>{
  const world=new World(5,5),m=metrics(),battery=new PowerBattery(2,2),load=new Fan(1,1);load.power=5000;
  world.addEntity(battery);world.addEntity(load);const dispatch=new BatteryDispatchSystem(world,m);
  const result=dispatch.dispatch(15000,3600);
  assert.equal(battery.operationState,'CHARGING');assert.equal(battery.chargePowerW,10000);
  assert.ok(Math.abs(result.gridPowerW-15000)<1e-6);
  assert.ok(Math.abs(battery.storedEnergyKWh-9.4868329805)<1e-6);
  assert.ok(m.generatedHeat>0);assert.ok(battery.storedEnergyJ<=battery.capacityJ);
  dispatch.dispatch(1e9,36000);
  assert.equal(battery.operationState,'FULL');assert.ok(battery.storedEnergyJ<=battery.capacityJ);
});

test('multiple batteries discharge by position before datacenter load shedding and never exceed power limits',()=>{
  const world=new World(8,6);world.thermalSystems=level.thermalSystems;
  const dcLevel={...level,datacenter:{powerCapacityKW:100,rackSpace:20},powerLimit:100000};
  const dc=new DataCenterManager(world,dcLevel,{saveSystem:new DataCenterSaveSystem({storage:null,key:'battery-grid-test'})});
  const sim=new Simulation(world,dcLevel);const build=new BuildSystem(world,sim,{budget:50000,inventory:{}});dc.attach(build,sim);
  const early=new PowerBattery(1,1,{storedEnergyJ:20*3_600_000}),late=new PowerBattery(3,1,{storedEnergyJ:20*3_600_000});
  const load=new Fan(5,3);load.power=118000;world.addEntity(late);world.addEntity(early);world.addEntity(load);
  sim.step(1/60);
  assert.equal(early.operationState,'DISCHARGING');assert.equal(early.dischargePowerW,10000);
  assert.equal(late.operationState,'DISCHARGING');assert.equal(late.dischargePowerW,8000);
  assert.equal(load.powerBlocked,false);assert.ok(sim.metrics.powerDraw<=100000+1e-6);
  assert.ok(Math.abs(sim.metrics.powerDraw-100000)<1e-6);
  assert.ok(early.storedEnergyJ<20*3_600_000&&late.storedEnergyJ<20*3_600_000);
});

test('battery dispatch is reconciled if rack shedding removes the peak',()=>{
  const world=new World(8,6),m=metrics(),battery=new PowerBattery(1,1,{storedEnergyJ:20*3_600_000});
  const infrastructure=new Fan(5,3);infrastructure.power=100000;
  const rack=new ServerRack(3,3,{startAt:0});rack.power=41000;rack.requestedPower=41000;
  world.addEntity(battery);world.addEntity(infrastructure);world.addEntity(rack);
  const dispatch=new BatteryDispatchSystem(world,m),grid=new PowerGridSystem({capacityKW:100});world.batteryDispatch=dispatch;
  dispatch.dispatch(100000,1);assert.equal(battery.dischargePowerW,10000);
  grid.update(world,1);
  assert.equal(rack.powerBlocked,true);assert.equal(battery.dischargePowerW,0);
  assert.equal(battery.storedEnergyJ,20*3_600_000);assert.equal(grid.effectiveKW,100);
});

test('disabled and empty batteries do not dispatch; campaign meter includes charging and discharge',()=>{
  const world=new World(6,6),battery=new PowerBattery(2,2),load=new Fan(1,1);load.power=6000;world.addEntity(battery);world.addEntity(load);
  const sim=new Simulation(world,{...level,powerLimit:12000});
  battery.enabled=false;sim.step(1);assert.equal(battery.operationState,'OFF');assert.equal(sim.metrics.powerDraw,6000);
  battery.enabled=true;sim.step(1);assert.equal(battery.operationState,'CHARGING');assert.equal(sim.metrics.powerDraw,12000);
  battery.storedEnergyJ=0;load.power=30000;sim.step(1);assert.equal(battery.operationState,'EMPTY');assert.equal(battery.dischargePowerW,0);assert.equal(sim.metrics.powerDraw,30000);
});

test('simulation history records stored kWh and the discharge that supplies a peak',()=>{
  const world=new World(6,6),battery=new PowerBattery(2,2,{storedEnergyJ:10*3_600_000}),load=new Fan(1,1);
  load.power=15000;world.addEntity(battery);world.addEntity(load);
  const sim=new Simulation(world,{...level,powerLimit:10000});sim.step(1);
  assert.equal(sim.history.length,1);
  assert.ok(sim.history[0].batteryStoredKWh<10);
  assert.equal(sim.history[0].batteryCapacityKWh,50);
  assert.equal(sim.history[0].batteryDischargeW,5000);
  assert.equal(sim.history[0].batteryChargeW,0);
});

test('battery is an unlimited-stock, budget-limited placeable tool and old saves grant access',()=>{
  const world=new World(5,5);world.thermalSystems={allBuildTools:true};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:16000,inventory:{fan:0}});
  assert.equal(build.inventory.battery,Infinity);build.select('battery');
  const first=build.place(1,1);assert.equal(first.ok,true);assert.equal(build.budget,8000);assert.equal(build.inventory.battery,Infinity);
  assert.equal(build.place(2,1).ok,true);assert.equal(build.budget,0);assert.equal(build.canAfford('battery'),false);
  const legacy={build:{budget:1234,inventory:{fan:2},placedEntities:[],placedMaterials:[]}};
  const restored=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:0,inventory:{}});
  new DataCenterSaveSystem({storage:null,key:'legacy-battery-test'}).restoreBuild(restored,legacy);
  assert.equal(restored.inventory.battery,Infinity);assert.equal(restored.budget,1234);
});

test('battery tool is available with unlimited quantity in campaign, Engineering and Data Center modes',()=>{
  const modes=[
    {thermalSystems:{simpleCooling:true,waterCooling:true}},
    {thermalSystems:{simpleCooling:true,waterCooling:true,allBuildTools:true}},
    {thermalSystems:{simpleCooling:true,waterCooling:true,allBuildTools:true},datacenterConfig:{allBuildTools:true,unlimitedBuildInventory:true}},
  ];
  for(const mode of modes){
    const world=new World(4,4);world.thermalSystems=mode.thermalSystems;world.datacenterConfig=mode.datacenterConfig||null;
    const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:8000,inventory:{}});
    assert.ok(build.catalog.battery);assert.equal(build.inventory.battery,Infinity);
  }
});

test('battery stored charge survives serialized world save and load',()=>{
  const world=new World(5,5),battery=new PowerBattery(2,3,{storedEnergyJ:17_250_000});world.addEntity(battery);
  const store=new DataCenterSaveSystem({storage:null,key:'battery-roundtrip-test'}),snapshot=store.capture(world,{}, {budget:9000,inventory:{battery:Infinity},placedEntities:new Map(),placedMaterials:new Map()});
  const restoredWorld=new World(5,5);store.restoreWorld(restoredWorld,snapshot);
  assert.equal(restoredWorld.entitiesByType('battery')[0].storedEnergyJ,17_250_000);
});

test('solar follows a fixed daylight curve and can be switched off',()=>{
  const panel=new SolarPanel(1,1);
  assert.equal(solarIrradiance(0),0);assert.equal(solarIrradiance(6),0);assert.equal(solarIrradiance(18),0);
  assert.equal(solarIrradiance(12),1);assert.ok(solarIrradiance(9)>0&&solarIrradiance(9)<1);
  assert.equal(panel.peakPowerW,10000);assert.equal(panel.updateGeneration(12),10000);
  assert.ok(Math.abs(panel.updateGeneration(9)-Math.sqrt(50_000_000))<1e-8);
  panel.enabled=false;assert.equal(panel.updateGeneration(12),0);panel.enabled=true;panel.powerBlocked=true;assert.equal(panel.updateGeneration(12),0);
  const oldSavePanel=new SolarPanel(2,2,{peakPowerW:2000});assert.equal(oldSavePanel.peakPowerW,10000,'legacy saved peak values use the new default');
});

test('solar offsets load first and its unused surplus charges batteries without grid export',()=>{
  const world=new World(6,6),m=metrics(),panel=new SolarPanel(1,1),load=new Fan(2,1),battery=new PowerBattery(3,1);
  load.power=1000;world.solarHour=12;world.addEntity(panel);world.addEntity(load);
  const dispatch=new BatteryDispatchSystem(world,m),covered=dispatch.dispatch(10000,60);
  assert.equal(covered.solarGenerationW,10000);assert.equal(covered.gridPowerW,0);assert.equal(covered.dischargeW,0);
  world.addEntity(battery);const surplus=dispatch.dispatch(10000,3600);
  assert.equal(surplus.solarChargeW,9000);assert.equal(surplus.gridChargeW,1000);assert.equal(surplus.gridPowerW,0);
  assert.ok(battery.storedEnergyKWh>0);
  battery.storedEnergyJ=battery.capacityJ;const full=dispatch.dispatch(10000,60);
  assert.equal(full.gridPowerW,0);assert.equal(full.solarChargeW,0);
});

test('solar generation is included in power protection before rack shedding',()=>{
  const world=new World(6,6),panel=new SolarPanel(1,1),rack=new ServerRack(3,3,{startAt:0});
  rack.power=11000;rack.requestedPower=11000;world.solarHour=12;
  world.addEntity(panel);world.addEntity(rack);
  const dispatch=new BatteryDispatchSystem(world,metrics()),grid=new PowerGridSystem({capacityKW:10});world.batteryDispatch=dispatch;
  dispatch.dispatch(10000,1);grid.update(world,1);
  assert.equal(rack.powerBlocked,false);assert.equal(grid.effectiveKW,1);
});

test('solar panel builds, inspects through the entity model, and survives a save roundtrip',()=>{
  const world=new World(5,5);world.thermalSystems={allBuildTools:true};
  const build=new BuildSystem(world,{totalInternalEnergy:()=>0,registerConstruction:()=>{}},{budget:5000,inventory:{}});
  assert.ok(build.catalog.solarPanel);build.select('solarPanel');const placement=build.place(2,3);
  assert.equal(placement.ok,true);assert.equal(placement.entity.type,'solarPanel');assert.equal(build.budget,2000);
  const store=new DataCenterSaveSystem({storage:null,key:'solar-panel-roundtrip'}),snapshot=store.capture(world,{},build),restoredWorld=new World(5,5);
  store.restoreWorld(restoredWorld,snapshot);
  const restored=restoredWorld.entitiesByType('solarPanel')[0];assert.ok(restored);assert.equal(restored.x,2);assert.equal(restored.y,3);assert.equal(restored.enabled,true);
});
