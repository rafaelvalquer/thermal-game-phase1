import test from 'node:test';
import assert from 'node:assert/strict';
import { datacenterSandbox } from '../../src/campaign/datacenterSandbox.js';
import { LevelManager } from '../../src/campaign/LevelManager.js';
import { BuildSystem } from '../../src/building/BuildSystem.js';
import { Simulation } from '../../src/simulation/Simulation.js';
import { DataCenterManager } from '../../src/datacenter/DataCenterManager.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { GameClock } from '../../src/datacenter/GameClock.js';
import { World } from '../../src/world/World.js';
import { DataCenterDashboard } from '../../src/ui/DataCenterDashboard.js';
import { BUILD_CATALOG } from '../../src/building/BuildCatalog.js';

class TestStorage {
  constructor(){this.values=new Map();}
  getItem(key){return this.values.get(key)||null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}

function createSandbox(storage=new TestStorage()){
  const level={...datacenterSandbox,inventory:{...datacenterSandbox.inventory},datacenter:{...datacenterSandbox.datacenter}};
  const world=new LevelManager().load(level),saveSystem=new DataCenterSaveSystem({storage,key:'sandbox-test'});
  const datacenter=new DataCenterManager(world,level,{saveSystem}),simulation=new Simulation(world,level);
  const build=new BuildSystem(world,simulation,{budget:level.budget,inventory:level.inventory});
  datacenter.attach(build,simulation);simulation.initialize();
  return {level,world,datacenter,simulation,build,storage,saveSystem};
}

test('data center sandbox starts with a large hall, starter capital, grid capacity, and three offers',()=>{
  const s=createSandbox();
  assert.ok(s.world.width>64);
  assert.equal(s.datacenter.cash,150000);
  assert.equal(s.datacenter.powerGrid.capacityKW,100);
  assert.equal(s.datacenter.state.reputation,50);
  assert.equal(s.datacenter.state.offers.length,3);
  assert.equal(s.datacenter.rackCount,0);
});

test('sandbox exposes every build tool with unlimited inventory and all physical systems enabled',()=>{
  const s=createSandbox();
  assert.deepEqual(Object.keys(s.build.catalog).sort(),Object.keys(BUILD_CATALOG).sort());
  assert.ok(Object.values(s.build.inventory).every(quantity=>quantity===Infinity));
  assert.equal(s.simulation.simpleCooling,true);
  assert.equal(s.simulation.waterCooling,true);
});

test('sandbox tool stock is unlimited while build prices remain constrained by cash',()=>{
  const s=createSandbox();s.build.select('fan');
  assert.equal(s.build.place(50,30).ok,true);
  assert.equal(s.build.inventory.fan,Infinity);
  assert.equal(s.build.budget,149900);
  s.build.budget=99;
  assert.equal(s.build.canAfford('fan'),false);
  assert.equal(s.build.place(52,30).ok,false);
  assert.equal(s.build.inventory.fan,Infinity);
});

test('data center dashboard exposes finance, PUE, capacity, contract market, and save controls',()=>{
  const s=createSandbox(),root={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  new DataCenterDashboard(root,s.datacenter).update();
  assert.match(root.innerHTML,/R\$ 150\.000/);
  assert.match(root.innerHTML,/PUE/);
  assert.match(root.innerHTML,/CAPACIDADE/);
  assert.match(root.innerHTML,/NovaBank/);
  assert.match(root.innerHTML,/AIForge/);
  assert.match(root.innerHTML,/data-accept=/);
  assert.match(root.innerHTML,/data-power-tier/);
  assert.match(root.innerHTML,/data-save/);
  assert.match(root.innerHTML,/R\$ 0,85\/kWh/);
});

test('game clock uses four real minutes per 24-hour game day',()=>{
  const clock=new GameClock();clock.advance(86400);
  assert.equal(clock.day,2);
  assert.equal(clock.format(),'Ano 1 · Mês 1 · Dia 2 · 00:00');
  clock.advance(9*3600+32*60);
  assert.match(clock.format(),/09:32$/);
});

test('sandbox runs one game day in four real minutes and 24x advances it in ten seconds',()=>{
  const world=new World(4,4),steps=[];
  world.thermalSystems={simpleCooling:true,waterCooling:false};
  world.datacenter={update:dt=>steps.push(dt),afterThermalStep:dt=>steps.push(dt)};
  const level={id:'clock-test',thermalSystems:world.thermalSystems,objectives:[],failures:[],events:[],missionDuration:Infinity,objectiveStartAt:0,powerLimit:1e9};
  const simulation=new Simulation(world,level);simulation.initialize();
  simulation.update(1/60);assert.equal(steps[0],6);assert.equal(steps[1],6);
  simulation.setSpeed(24);simulation.update(1/60);assert.equal(steps[2],144);
});

test('accepted contracts create client racks whose variable load becomes electrical draw and heat',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1');
  assert.equal(accepted.ok,true);
  assert.equal(s.datacenter.cash,165000);
  s.build.select('serverRack');
  for(const x of [22,24,26,28])assert.equal(s.build.place(x,20).ok,true);
  assert.equal(accepted.contract.status,'active');
  assert.equal(accepted.contract.installedRacks,4);
  assert.equal(s.datacenter.clientCount,1);
  s.datacenter.racks.update(1,s.datacenter.clock);
  const rack=s.world.entitiesByType('serverRack')[0];
  assert.equal(rack.clientId,'NovaBank');
  assert.equal(rack.maxPowerKW,12);
  assert.ok(Math.abs(rack.cpuLoad-.3)<1e-6);
  assert.ok(Math.abs(rack.heatOutput*rack.loadMultiplier-rack.currentPowerKW*980)<1e-6);
  s.simulation.energySystem.update(1);
  assert.ok(Math.abs(s.simulation.metrics.powerDraw-14400)<1e-6);
  s.simulation.thermal.applyHeatSources(1,10);
  assert.ok(s.simulation.metrics.generatedHeat>0);
  assert.ok(rack.temperature>25);
});

test('accepting a contract refreshes toolbar state so rack placement becomes available',()=>{
  const s=createSandbox();let toolbarRefreshes=0;s.build.onChange=()=>toolbarRefreshes++;
  assert.equal(s.build.canAfford('serverRack'),true);
  s.build.select('serverRack');
  const blocked=s.build.place(22,20);
  assert.equal(blocked.ok,false);
  assert.match(blocked.reason,/Aceite um contrato/);
  toolbarRefreshes=0;
  const offer=s.datacenter.state.offers[0],result=s.datacenter.acceptOffer(offer.id);
  assert.equal(result.ok,true);
  assert.equal(s.build.canAfford('serverRack'),true);
  assert.equal(toolbarRefreshes,1);
});

test('repeated acceptance of an offer cannot charge or create the contract twice',()=>{
  const s=createSandbox(),offer=s.datacenter.state.offers[0];
  const first=s.datacenter.acceptOffer(offer.id),cashAfterFirst=s.datacenter.cash;
  const repeated=s.datacenter.acceptOffer(offer.id);
  assert.equal(first.ok,true);
  assert.equal(repeated.ok,true);
  assert.equal(repeated.alreadyAccepted,true);
  assert.equal(s.datacenter.cash,cashAfterFirst);
  assert.equal(s.datacenter.state.contracts.filter(contract=>contract.id===offer.id).length,1);
});

test('offer can be accepted through either its market id or its contract id',()=>{
  const s=createSandbox(),offer=s.datacenter.state.offers[0];
  const result=s.datacenter.acceptOffer(offer.contractId);
  assert.equal(result.ok,true);
  assert.equal(result.contract.clientName,offer.clientName);
});

test('daily billing includes kWh, fixed grid fees, climatization upkeep, client revenue, and SLA fines',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1');
  s.build.select('serverRack');for(const x of [22,24,26,28])s.build.place(x,20);
  const before=s.datacenter.cash;
  s.simulation.metrics.powerEnergy=360000000;
  accepted.contract.dailyViolation=true;
  s.datacenter.settleDay(2);
  assert.equal(s.datacenter.state.dailyResult.energyKWh,100);
  assert.equal(s.datacenter.state.dailyResult.energyCost,85);
  assert.equal(s.datacenter.state.dailyResult.fixedPowerCost,100);
  assert.equal(s.datacenter.state.dailyResult.coolingMaintenance,110);
  assert.equal(s.datacenter.state.dailyResult.penalties,5000);
  assert.ok(s.datacenter.cash<before);
  assert.equal(accepted.contract.violationDays,1);
});

test('availability below a contract target triggers an SLA fine and repeated failures cancel it',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1');
  s.build.select('serverRack');for(const x of [22,24,26,28])s.build.place(x,20);
  const contract=accepted.contract;
  for(const day of [2,3,4]){
    contract.dailyActiveSeconds=100;contract.dailyUptimeSeconds=99;contract.dailyDowntimeSeconds=1;
    s.datacenter.settleDay(day);
  }
  assert.equal(contract.violationDays,3);
  assert.equal(contract.status,'cancelled');
  assert.equal(contract.cancelReason,'SLA violado por três dias consecutivos');
  s.datacenter.racks.update(1,s.datacenter.clock);
  assert.ok(s.world.entitiesByType('serverRack').every(rack=>rack.status==='CANCELLED'));
});

test('power expansions charge installation cost and raise the actual simulation limit',()=>{
  const s=createSandbox();
  const result=s.datacenter.upgradePower(250);
  assert.equal(result.ok,true);
  assert.equal(s.datacenter.cash,100000);
  assert.equal(s.datacenter.powerGrid.capacityKW,250);
  assert.equal(s.level.powerLimit,250000);
  assert.equal(s.datacenter.powerGrid.tier.monthlyFixedCost,7000);
});

test('sandbox persistence restores installed client racks, map state, money, and offers',()=>{
  const first=createSandbox();first.datacenter.acceptOffer('offer-1');
  first.build.select('serverRack');first.build.place(22,20);first.world.setTemperature(30,30,43);
  const cash=first.datacenter.cash;assert.equal(first.datacenter.persist(),true);
  const restored=createSandbox(first.storage);
  assert.equal(restored.datacenter.cash,cash);
  assert.equal(restored.datacenter.state.offers.length,2);
  assert.equal(restored.datacenter.rackCount,1);
  assert.equal(restored.world.entitiesByType('serverRack')[0].clientId,'NovaBank');
  assert.equal(restored.world.temperatureAt(30,30),43);
  assert.equal(restored.datacenter.state.contracts[0].installedRacks,1);
  assert.ok(Object.values(restored.build.inventory).every(quantity=>quantity===Infinity));
});

test('clearing sandbox save allows the next session to start from the initial state',()=>{
  const storage=new TestStorage(),played=createSandbox(storage);
  played.datacenter.acceptOffer('offer-1');
  played.datacenter.update(3600);
  assert.notEqual(played.datacenter.cash,150000);
  assert.equal(played.datacenter.clearSave(),true);
  const restarted=createSandbox(storage);
  assert.equal(restarted.datacenter.cash,150000);
  assert.equal(restarted.datacenter.state.contracts.length,0);
  assert.equal(restarted.datacenter.state.offers.length,3);
});
