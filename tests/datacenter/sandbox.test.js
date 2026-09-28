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
import { CoolingUnit, AirDuct, SupplyVent, ServerRack } from '../../src/entities/index.js';
import { UIManager } from '../../src/ui/UIManager.js';
import { Renderer } from '../../src/rendering/Renderer.js';

class TestStorage {
  constructor(){this.values=new Map();}
  getItem(key){return this.values.get(key)||null;}
  setItem(key,value){this.values.set(key,String(value));}
  removeItem(key){this.values.delete(key);}
}

function createSandbox(storage=new TestStorage(),random=Math.random){
  const level={...datacenterSandbox,inventory:{...datacenterSandbox.inventory},datacenter:{...datacenterSandbox.datacenter}};
  const world=new LevelManager().load(level),saveSystem=new DataCenterSaveSystem({storage,key:'sandbox-test'});
  const datacenter=new DataCenterManager(world,level,{saveSystem,random}),simulation=new Simulation(world,level);
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
  assert.match(root.innerHTML,/role="table"/);
  assert.match(root.innerHTML,/data-power-amount/);
  assert.match(root.innerHTML,/data-power-preview/);
  assert.match(root.innerHTML,/R\$ 166,67\/kW/);
  assert.match(root.innerHTML,/data-save/);
  assert.match(root.innerHTML,/R\$ 0,85\/kWh/);
});

test('active clients accordion starts collapsed and summarizes contracts, racks, and committed versus current power',()=>{
  const s=createSandbox(),contract=s.datacenter.acceptOffer('offer-1').contract;
  contract.status='active';contract.installedRacks=2;
  for(const [index,x] of [12,15].entries()){const rack=new ServerRack(x,20,{name:'Resumo '+index,contractId:contract.id});rack.power=6000;s.world.addEntity(rack);}
  const toggle={attributes:{},listeners:{},setAttribute(name,value){this.attributes[name]=value;},addEventListener(type,handler){this.listeners[type]=handler;}};
  const panelElement={hidden:true};
  const root={innerHTML:'',querySelectorAll:()=>[],querySelector(selector){return selector==='[data-contract-accordion-toggle]'?toggle:selector==='[data-contract-accordion-panel]'?panelElement:null;}};
  const panel=new DataCenterDashboard(root,s.datacenter);panel.update();
  assert.equal(panel.contractsExpanded,false);assert.equal(toggle.attributes['aria-expanded'],'false');assert.equal(panelElement.hidden,true);
  assert.match(root.innerHTML,/Ativos<strong>1<\/strong>/);assert.match(root.innerHTML,/Instalação<strong>0<\/strong>/);
  assert.match(root.innerHTML,/Racks instalados<strong>2 \/ 4<\/strong>/);
  assert.match(root.innerHTML,/Potência comprometida<strong>48,0 kW<\/strong>/);
  assert.match(root.innerHTML,/Consumo atual<strong>12,0 kW<\/strong>/);
  toggle.listeners.click({currentTarget:toggle});
  assert.equal(toggle.attributes['aria-expanded'],'true');assert.equal(panelElement.hidden,false);
  panel.lastHtml='';panel.update();
  assert.equal(panel.contractsExpanded,true);assert.match(root.innerHTML,/aria-expanded="true"/);
  assert.doesNotMatch(root.innerHTML,/data-contract-accordion-panel hidden/);
});

test('active clients accordion presents an empty state when there are no active or installing contracts',()=>{
  const s=createSandbox(),root={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  new DataCenterDashboard(root,s.datacenter).update();
  assert.match(root.innerHTML,/0 contratos/);assert.match(root.innerHTML,/Aceite uma proposta para começar a operar\./);
  assert.match(root.innerHTML,/aria-expanded="false"/);assert.match(root.innerHTML,/Racks instalados<strong>0 \/ 0<\/strong>/);
});

test('clicking an active contract lists its assigned racks and notifies map selection without disturbing inspector state',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1'),contract=accepted.contract,selected=[];
  for(const [index,x] of [12,15].entries())s.world.addEntity(new ServerRack(x,20,{name:'Nova rack '+(index+1),contractId:contract.id}));
  contract.installedRacks=2;
  const card={dataset:{selectContract:contract.id},listeners:{},addEventListener(type,handler){this.listeners[type]=handler;}};
  const root={innerHTML:'',querySelectorAll(selector){return selector==='[data-select-contract]'&&this.innerHTML.includes('data-select-contract')?[card]:[];},querySelector:()=>null};
  const selection=[],panel=new DataCenterDashboard(root,s.datacenter,()=>{},()=>{},(...args)=>selection.push(args));
  panel.update();card.listeners.click({target:{closest:selector=>selector==='[data-cancel]'?{}:null}});
  assert.equal(panel.selectedContractId,null);assert.equal(selection.length,0);
  card.listeners.click({target:{closest:()=>null}});
  assert.match(root.innerHTML,/RACKS DO CONTRATO · 2 \/ 4/);
  assert.match(root.innerHTML,/Nova rack 1/);assert.match(root.innerHTML,/posição 13, 21/);assert.match(root.innerHTML,/Faltam 2 racks/);
  assert.deepEqual(selection[0],[contract.id,s.world.entitiesByType('serverRack'),true]);
  card.listeners.click({target:{closest:()=>null}});assert.doesNotMatch(root.innerHTML,/RACKS DO CONTRATO/);
  assert.deepEqual(selection[1],[null,[],false]);
});

test('contract rack focus frames the racks and renderer highlights their group independently of inspector selection',()=>{
  const rackA={x:10,y:8,type:'serverRack',contractId:'contract-focus'},rackB={x:12,y:8,type:'serverRack',contractId:'contract-focus'},other={x:14,y:8,type:'serverRack',contractId:'other'};
  const camera={x:0,y:0,zoom:1,minZoom:.35,maxZoom:2.4,constrain(){this.constrained=true;}},game={camera,canvas:{getBoundingClientRect:()=>({width:900,height:600})},renderer:{tile:14},world:{width:40,height:30}};
  UIManager.prototype.selectContractRacks.call({game},'contract-focus',[rackA,rackB],true);
  assert.ok(camera.zoom>.35);assert.ok(camera.constrained);assert.ok(Number.isFinite(camera.x)&&Number.isFinite(camera.y));
  const renderer=new Renderer({getContext:()=>({})},camera),inspected={id:'inspected'},outlined=[];
  renderer.selectedEntity=inspected;renderer.highlightedContractId='contract-focus';renderer.outlineEntity=(ctx,rack,color)=>outlined.push([rack,color]);
  renderer.drawContractRackHighlights({}, {entities:[rackA,rackB,other]},0);
  assert.deepEqual(outlined,[[rackA,'#38bdf8'],[rackB,'#38bdf8']]);assert.equal(renderer.selectedEntity,inspected);
});

test('ending a selected contract clears its rack-map highlight',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1'),contract=accepted.contract,cleared=[];
  const root={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  const panel=new DataCenterDashboard(root,s.datacenter,()=>{},()=>{},(...args)=>cleared.push(args));
  panel.selectedContractId=contract.id;s.datacenter.cancelContract(contract.id);panel.update();
  assert.equal(panel.selectedContractId,null);assert.deepEqual(cleared,[[null,[],false]]);
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
  assert.equal(rack.slaTemperature,32);
  assert.equal(accepted.contract.maxInletTemperature,32);
  assert.ok(Math.abs(rack.cpuLoad-.3)<1e-6);
  assert.ok(Math.abs(rack.heatOutput*rack.loadMultiplier-rack.currentPowerKW*980)<1e-6);
  s.simulation.energySystem.update(1);
  assert.ok(Math.abs(s.simulation.metrics.powerDraw-14400)<1e-6);
  s.simulation.thermal.applyHeatSources(1,10);
  assert.ok(s.simulation.metrics.generatedHeat>0);
  assert.ok(rack.temperature>25);
});

test('contracted rack capacity stays reserved independently from current load and installed rack count',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1');
  assert.equal(accepted.contract.status,'installing');
  assert.equal(s.datacenter.committedPowerKW,48);
  assert.equal(s.datacenter.powerReserveKW,52);
  s.build.select('serverRack');for(const x of [22,24,26,28])assert.equal(s.build.place(x,20).ok,true);
  s.datacenter.racks.update(1,s.datacenter.clock);s.simulation.energySystem.update(1);
  assert.equal(accepted.contract.status,'active');
  assert.ok(Math.abs(s.datacenter.serverPowerKW-14.4)<1e-9);
  assert.ok(Math.abs(s.datacenter.facilityPowerKW-14.4)<1e-9);
  assert.equal(s.datacenter.committedPowerKW,48);
  assert.equal(s.datacenter.contractedPowerKW,100);
  assert.equal(s.datacenter.committedFacilityPowerKW,48);
  assert.equal(s.datacenter.powerReserveKW,52);
  assert.equal(s.datacenter.availableEnergyKW,52);
  s.simulation.metrics.powerDraw=20400;
  assert.ok(Math.abs(s.datacenter.facilityPowerKW-20.4)<1e-9);
  assert.equal(s.datacenter.otherFacilityPowerKW,6);
  assert.equal(s.datacenter.committedFacilityPowerKW,54);
  assert.equal(s.datacenter.powerReserveKW,52);
  assert.equal(s.datacenter.availableEnergyKW,52);
  s.simulation.metrics.powerDraw=14400;

  const root={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  new DataCenterDashboard(root,s.datacenter).update();
  assert.match(root.innerHTML,/Consumo e capacidade contratual elétrica e térmica/);
  assert.match(root.innerHTML,/Atual/);
  assert.match(root.innerHTML,/14,4 kW/);
  assert.match(root.innerHTML,/REFRIGERAÇÃO/);
  assert.match(root.innerHTML,/Comprometida/);
  assert.match(root.innerHTML,/Energia comprometida/);
  assert.match(root.innerHTML,/48,0 kW \/ 100,0 kW/);
  assert.match(root.innerHTML,/Capacidade/);
  assert.match(root.innerHTML,/rede contratada/);
  assert.match(root.innerHTML,/Reserva elétrica/);
  assert.match(root.innerHTML,/52,0 kW/);
});

test('current rack heat follows load while cooling commitment and headroom use effective capacity',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1');
  assert.equal(s.datacenter.committedPowerKW,48);
  assert.equal(s.datacenter.currentRackHeatKW,0);
  s.build.select('serverRack');for(const x of [22,24,26,28])assert.equal(s.build.place(x,20).ok,true);
  s.datacenter.racks.update(1,s.datacenter.clock);
  s.simulation.thermal.applyHeatSources(1,10);
  assert.equal(accepted.contract.status,'active');
  assert.ok(Math.abs(s.datacenter.currentRackHeatKW-14.112)<1e-6);
  assert.equal(s.datacenter.committedPowerKW,48);
  assert.equal(s.datacenter.committedCoolingKW,47.04);

  s.simulation.metrics.coolingInstalledCapacity=90000;
  s.simulation.metrics.coolingAvailableCapacity=60000;
  assert.equal(s.datacenter.effectiveCoolingCapacityKW,60);
  assert.ok(Math.abs(s.datacenter.coolingReserveKW-12.96)<1e-9);
  assert.ok(Math.abs(s.datacenter.availableCoolingContractsKW-(12.96/.98))<1e-9);
  assert.ok(Math.abs(s.datacenter.capacityForNewContractsKW-Math.min(52,12.96/.98))<1e-9);
});

test('cancelled contracts release capacity and overcommitment remains visible with acceptance allowed',()=>{
  const s=createSandbox();
  assert.equal(s.datacenter.acceptOffer('offer-1').ok,true);
  assert.equal(s.datacenter.committedPowerKW,48);
  assert.equal(s.datacenter.cancelContract(s.datacenter.state.contracts[0].id),true);
  assert.equal(s.datacenter.committedPowerKW,0);
  assert.equal(s.datacenter.powerReserveKW,100);

  const overcommitted=createSandbox();
  assert.equal(overcommitted.datacenter.acceptOffer('offer-1').ok,true);
  assert.equal(overcommitted.datacenter.acceptOffer('offer-2').ok,true);
  assert.equal(overcommitted.datacenter.committedPowerKW,112);
  assert.equal(overcommitted.datacenter.powerReserveKW,-12);
  assert.equal(overcommitted.datacenter.availableEnergyKW,0);
  const root={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  new DataCenterDashboard(root,overcommitted.datacenter).update();
  assert.match(root.innerHTML,/Reserva elétrica/);
  assert.match(root.innerHTML,/-12,0 kW/);
  assert.match(root.innerHTML,/Máximo solicitado 120,0 kW/);
  assert.match(root.innerHTML,/power-risk/);
  assert.equal(overcommitted.datacenter.acceptOffer('offer-3').ok,true);
  assert.equal(overcommitted.datacenter.committedPowerKW,232);
  assert.equal(overcommitted.datacenter.powerReserveKW,-132);
});

test('cancelled contract racks stop producing heat and are reused by the next customer',()=>{
  const s=createSandbox(),first=s.datacenter.acceptOffer('offer-1');
  s.build.select('serverRack');for(const x of [22,24,26,28])assert.equal(s.build.place(x,20).ok,true);
  const original=s.world.entitiesByType('serverRack').slice(),originalIds=original.map(rack=>rack.id);
  assert.equal(s.datacenter.cancelContract(first.contract.id),true);
  assert.ok(original.every(rack=>!rack.enabled&&rack.contractId===null&&rack.clientId===null&&rack.heatOutput===0&&rack.heatGenerationPower===0));

  const next=s.datacenter.acceptOffer('offer-2');
  assert.equal(next.contract.status,'installing');
  assert.equal(next.contract.installedRacks,4);
  assert.ok(original.every(rack=>rack.contractId===next.contract.id&&rack.clientId==='PixelGames'&&rack.maxPowerKW===8&&rack.enabled));
  for(const x of [30,32,34,36])assert.equal(s.build.place(x,20).ok,true);
  assert.equal(next.contract.status,'active');
  assert.equal(next.contract.installedRacks,8);
  assert.equal(s.world.entitiesByType('serverRack').length,8);
  assert.deepEqual(original.map(rack=>rack.id),originalIds,'reassignment reuses the same physical racks');
});

test('completed contracts retire their racks without leaving a heat load behind',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1');
  s.build.select('serverRack');for(const x of [22,24,26,28])assert.equal(s.build.place(x,20).ok,true);
  const racks=s.world.entitiesByType('serverRack').slice();
  accepted.contract.expiresDay=2;s.datacenter.clock.advance(86400);
  s.datacenter.settleDay(2);
  assert.equal(accepted.contract.status,'completed');
  assert.ok(racks.every(rack=>rack.contractId===null&&!rack.enabled&&rack.heatOutput===0&&rack.heatGenerationPower===0));
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
  assert.equal(accepted.contract.monthlyFee,42000);
  assert.equal(s.datacenter.state.dailyResult.revenue,1400);
  assert.ok(s.datacenter.cash<before);
  assert.equal(accepted.contract.violationDays,1);
});

test('daily close accumulates operational readings, generates offers once, and pauses by default',()=>{
  const s=createSandbox();
  s.datacenter.clock.seconds=86400;
  s.simulation.metrics.powerDraw=20000;s.simulation.metrics.powerEnergy=1728000000;
  s.simulation.metrics.maxAirTemp=31;
  s.datacenter.afterThermalStep(86400);
  const result=s.datacenter.state.dailyResult;
  assert.equal(result.day,1);
  assert.equal(result.operations.averagePowerKW,20);
  assert.equal(result.operations.peakPowerKW,20);
  assert.equal(result.operations.maxAirTemperature,31);
  assert.ok(result.newOffers.length>=1&&result.newOffers.length<=2);
  assert.equal(s.datacenter.state.offers.length,3+result.newOffers.length);
  assert.equal(s.simulation.paused,true);
  s.datacenter.afterThermalStep(1);
  assert.equal(s.datacenter.state.offers.length,3+result.newOffers.length);
  assert.equal(s.datacenter.state.dailyResult.day,1);
});

test('daily settlement queues one expansion invitation for a qualified active client and saves it',()=>{
  const storage=new TestStorage(),s=createSandbox(storage,()=>.05),accepted=s.datacenter.acceptOffer('offer-1');
  s.build.select('serverRack');for(const x of [22,24,26,28])assert.equal(s.build.place(x,20).ok,true);
  accepted.contract.lastSlaViolationDay=0;s.datacenter.state.reputation=75;
  s.datacenter.clock.advance(86400);s.datacenter.settleDay(2);
  const pending=s.datacenter.state.pendingExpansionOffer;
  assert.ok(pending);assert.equal(pending.contractId,accepted.contract.id);
  assert.equal(accepted.contract.lastExpansionOfferDay,2);
  assert.equal(s.datacenter.state.dailyResult.pendingExpansionOffer,undefined);
  const restored=createSandbox(storage,()=>.99);
  assert.deepEqual(restored.datacenter.state.pendingExpansionOffer,pending);
  assert.equal(restored.datacenter.state.contracts[0].lastExpansionOfferDay,2);
});

test('accepting a rack expansion pays the installation fee and queues new racks without suspending the contract',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1'),contract=accepted.contract;
  s.build.select('serverRack');for(const x of [22,24,26,28])assert.equal(s.build.place(x,20).ok,true);
  contract.expiresDay=50;
  s.datacenter.state.pendingExpansionOffer={id:'expansion-test',contractId:contract.id,expansionType:'racks',rackCount:5,powerPerRackKW:12,
    monthlyFee:52500,installationFee:3750,expiresDay:s.datacenter.clock.day+contract.termDays};
  const before=s.datacenter.cash,result=s.datacenter.respondToExpansionOffer(true);
  assert.equal(result.ok,true);assert.equal(result.accepted,true);assert.equal(s.datacenter.cash,before+3750);
  assert.equal(contract.status,'active');assert.equal(contract.rackCount,5);assert.equal(contract.monthlyFee,52500);
  assert.equal(contract.expiresDay,s.datacenter.clock.day+180);assert.equal(contract.amendmentCount,1);
  const next=s.datacenter.nextRackPlacement();assert.equal(next.contractId,contract.id);assert.equal(next.rackNumber,5);
  assert.equal(s.build.place(30,20).ok,true);assert.equal(contract.status,'active');assert.equal(contract.installedRacks,5);
});

test('accepting a capacity expansion updates every existing rack and refusal leaves the contract unchanged',()=>{
  const s=createSandbox(),accepted=s.datacenter.acceptOffer('offer-1'),contract=accepted.contract;
  s.build.select('serverRack');for(const x of [22,24,26,28])assert.equal(s.build.place(x,20).ok,true);
  const racks=s.world.entitiesByType('serverRack').slice(),before=s.datacenter.cash;
  s.datacenter.state.pendingExpansionOffer={id:'expansion-power',contractId:contract.id,expansionType:'power',rackCount:4,powerPerRackKW:15,
    monthlyFee:52500,installationFee:3750,expiresDay:s.datacenter.clock.day+180};
  const result=s.datacenter.respondToExpansionOffer(true);
  assert.equal(result.ok,true);assert.ok(racks.every(rack=>rack.maxPowerKW===15&&rack.baseHeatOutput===14700&&rack.heatOutput===14700));
  assert.equal(s.datacenter.cash,before+3750);assert.equal(contract.powerPerRackKW,15);assert.equal(contract.rackCount,4);
  const state={...contract},cash=s.datacenter.cash;
  s.datacenter.state.pendingExpansionOffer={id:'expansion-decline',contractId:contract.id};
  const declined=s.datacenter.respondToExpansionOffer(false);
  assert.equal(declined.ok,true);assert.equal(declined.accepted,false);assert.equal(s.datacenter.cash,cash);
  assert.equal(contract.monthlyFee,state.monthlyFee);assert.equal(contract.rackCount,state.rackCount);assert.equal(contract.powerPerRackKW,state.powerPerRackKW);
});

test('expansion modal waits for the daily report and restores the previous pause state after a decision',()=>{
  const offer={id:'expansion-1',clientName:'NovaBank',expansionType:'racks',currentRackCount:4,rackCount:5,currentPowerPerRackKW:12,powerPerRackKW:12,
    currentCapacityKW:48,capacityKW:60,currentMonthlyFee:42000,monthlyFee:52500,monthlyIncrease:10500,installationFee:3750,currentExpiresDay:50,expiresDay:200};
  const buttons=['decline','accept'].map(decision=>({dataset:{expansionDecision:decision},addEventListener(type,handler){this.handler=handler;},focus(){this.focused=true;}}));
  const root={hidden:false,innerHTML:'',querySelectorAll:()=>buttons,querySelector:selector=>selector.includes('accept')?buttons[1]:null};
  const sim={paused:false},messages=[],datacenter={state:{pendingExpansionOffer:offer,reportPending:false},respondToExpansionOffer(accept){this.state.pendingExpansionOffer=null;return {ok:true,accepted:accept,contract:{clientName:'NovaBank',rackCount:5}};}};
  const ui=Object.create(UIManager.prototype);Object.assign(ui,{game:{datacenter,sim,toast:message=>messages.push(message)},reportRoot:root,expansionModalOfferId:null,resumeAfterExpansionOffer:false});
  ui.updateExpansionOfferModal();assert.equal(ui.expansionModalOfferId,null);assert.equal(sim.paused,false,'a visible daily report retains priority');
  root.hidden=true;ui.updateExpansionOfferModal();assert.equal(sim.paused,true);assert.equal(root.hidden,false);
  assert.match(root.innerHTML,/CONVITE DE EXPANSÃO/);assert.match(root.innerHTML,/R\$ 42\.000/);assert.ok(buttons[1].focused);
  ui.closeDailyReport();assert.equal(root.hidden,false,'escape and backdrop dismissal cannot bypass the decision buttons');
  buttons[1].handler();assert.equal(sim.paused,false);assert.equal(root.hidden,true);assert.match(messages[0],/Aditivo aceito/);

  root.hidden=true;sim.paused=true;datacenter.state.pendingExpansionOffer={...offer,id:'expansion-2'};
  ui.updateExpansionOfferModal();buttons[0].handler();assert.equal(sim.paused,true,'a game already paused before the modal remains paused');
  assert.equal(datacenter.state.pendingExpansionOffer,null);assert.match(messages[1],/recusada/);
});

test('market setting disables the automatic report pause and queues a notification',()=>{
  const s=createSandbox();s.datacenter.setPauseOnNewContracts(false);
  s.datacenter.clock.seconds=86400;s.datacenter.afterThermalStep(86400);
  assert.equal(s.simulation.paused,false);
  assert.equal(s.datacenter.state.notificationPending,true);
  assert.equal(s.datacenter.consumeNotification().day,1);
  assert.equal(s.datacenter.consumeNotification(),null);
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
  const result=s.datacenter.upgradePower(50);
  assert.equal(result.ok,true);
  assert.equal(result.addedKW,50);
  assert.equal(result.cost,8333);
  assert.equal(result.monthlyIncrease,667);
  assert.equal(result.monthlyFixedCost,3667);
  assert.equal(s.datacenter.cash,141667);
  assert.equal(s.datacenter.powerGrid.capacityKW,150);
  assert.equal(s.level.powerLimit,150000);
  assert.equal(s.datacenter.powerGrid.monthlyFixedCost,3667);
});

test('power upgrade preview recalculates the added capacity and cost while editing',()=>{
  const s=createSandbox(),events={};
  const amount={value:'50',addEventListener:(name,handler)=>events[name]=handler};
  const preview={textContent:''},button={disabled:false,addEventListener(){}};
  const root={innerHTML:'',querySelectorAll:()=>[],querySelector:selector=>({'[data-power-amount]':amount,'[data-power-preview]':preview,'[data-upgrade]':button})[selector]||null};
  const panel=new DataCenterDashboard(root,s.datacenter);panel.update();
  amount.value='30';events.input();
  assert.match(preview.textContent,/Instalação R\$ 5\.000/);
  assert.match(preview.textContent,/total 130,0 kW/);
  assert.match(preview.textContent,/tarifa fixa R\$ 3\.400\/mês/);
  assert.equal(button.disabled,false);
  panel.update();assert.match(root.innerHTML,/value="30"/,'the edited quantity is retained when the panel refreshes');
  amount.value='0';events.input();
  assert.match(preview.textContent,/pelo menos 1 kW/);
  assert.equal(button.disabled,true);
});

test('power purchases are cumulative and reject invalid, oversized, and unaffordable increments',()=>{
  const s=createSandbox();
  assert.equal(s.datacenter.upgradePower(20).capacityKW,120);
  const second=s.datacenter.upgradePower(30);
  assert.equal(second.capacityKW,150);
  assert.equal(second.monthlyFixedCost,3667);
  const currentCash=s.datacenter.cash;
  for(const amount of [0,-1,1.5,NaN,4900])assert.equal(s.datacenter.upgradePower(amount).ok,false);
  assert.equal(s.datacenter.powerGrid.capacityKW,150);
  assert.equal(s.datacenter.cash,currentCash);
  s.datacenter.powerGrid.capacityKW=100;
  assert.equal(s.datacenter.powerGrid.quote(4900).capacityKW,5000);
  assert.equal(s.datacenter.powerGrid.quote(4901).ok,false);
  s.datacenter.powerGrid.capacityKW=4999;
  assert.equal(s.datacenter.upgradePower(2).ok,false);
  assert.equal(s.datacenter.powerGrid.capacityKW,4999);
  s.datacenter.powerGrid.capacityKW=100;
  s.build.budget=100;
  assert.equal(s.datacenter.upgradePower(1).reason,'Capital insuficiente para ampliar a rede elétrica.');
  assert.equal(s.datacenter.powerGrid.capacityKW,100);
});

test('incremental grid capacity survives save reload and scales the daily fixed fee',()=>{
  const first=createSandbox();
  assert.equal(first.datacenter.upgradePower(50).ok,true);
  first.datacenter.clock.advance(86400);
  first.datacenter.settleDay(2);
  assert.ok(Math.abs(first.datacenter.state.dailyResult.fixedPowerCost-3667/30)<1e-9);
  const restored=createSandbox(first.storage);
  assert.equal(restored.datacenter.contractedPowerKW,150);
  assert.equal(restored.datacenter.powerGrid.monthlyFixedCost,3667);
});

test('sandbox persistence restores installed client racks, map state, money, and offers',()=>{
  const first=createSandbox();first.datacenter.acceptOffer('offer-1');
  first.build.select('serverRack');first.build.rotate();first.build.place(22,20);first.world.setTemperature(30,30,43);
  const cash=first.datacenter.cash;assert.equal(first.datacenter.persist(),true);
  const restored=createSandbox(first.storage);
  assert.equal(restored.datacenter.cash,cash);
  assert.equal(restored.datacenter.state.offers.length,2);
  assert.equal(restored.datacenter.rackCount,1);
  assert.equal(restored.world.entitiesByType('serverRack')[0].clientId,'NovaBank');
  assert.deepEqual(restored.world.entitiesByType('serverRack')[0].airIntakeDirection,{x:1,y:0});
  assert.deepEqual(restored.world.entitiesByType('serverRack')[0].airExhaustDirection,{x:-1,y:0});
  assert.equal(restored.world.temperatureAt(30,30),43);
  assert.equal(restored.datacenter.state.contracts[0].installedRacks,1);
  assert.ok(Object.values(restored.build.inventory).every(quantity=>quantity===Infinity));
});

test('loading a legacy rack with same-side intake and exhaust restores the opposite hot face',()=>{
  const first=createSandbox();first.world.addEntity(new ServerRack(20,20,{airIntakeDirection:{x:1,y:0}}));
  first.datacenter.persist();
  const snapshot=JSON.parse(first.storage.getItem('sandbox-test'));
  const savedRack=snapshot.world.entities.find(entity=>entity.type==='serverRack');
  savedRack.properties.airIntakeDirection={x:1,y:0};savedRack.properties.airExhaustDirection={x:1,y:0};
  first.storage.setItem('sandbox-test',JSON.stringify(snapshot));

  const restored=createSandbox(first.storage).world.entitiesByType('serverRack')[0];
  assert.deepEqual(restored.airIntakeDirection,{x:1,y:0});
  assert.deepEqual(restored.airExhaustDirection,{x:-1,y:0});
});

test('rack orientation rotates through all four intake faces before placement',()=>{
  const s=createSandbox();s.build.select('serverRack');
  assert.deepEqual(s.build.direction(),{x:0,y:-1});
  const directions=[];for(let i=0;i<4;i++){s.build.rotate();directions.push({...s.build.direction()});}
  assert.deepEqual(directions,[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}]);
});

test('sandbox persistence restores air ducts and connected cooling network',()=>{
  const first=createSandbox();
  const unit=first.world.addEntity(new CoolingUnit(42,12));
  first.world.addUtility(new AirDuct(43,12,{insulated:false,flowWeight:2}));
  first.world.addUtility(new AirDuct(44,12,{insulated:true,flowWeight:1}));
  const vent=first.world.addEntity(new SupplyVent(45,12,{direction:{x:1,y:0}}));
  first.datacenter.persist();

  const restored=createSandbox(first.storage);
  const ducts=restored.world.allUtilities().filter(item=>item.type==='duct');
  assert.equal(ducts.length,2);
  assert.deepEqual(ducts.map(({x,y,insulated,flowWeight})=>({x,y,insulated,flowWeight})),[
    {x:43,y:12,insulated:false,flowWeight:2},{x:44,y:12,insulated:true,flowWeight:1},
  ]);
  const loadedUnit=restored.world.entities.find(item=>item.type==='coolingUnit'&&item.x===unit.x);
  const loadedVent=restored.world.entities.find(item=>item.type==='supplyVent'&&item.x===vent.x);
  assert.ok(loadedUnit);assert.ok(loadedVent);
  restored.simulation.cooling.update(1/60);
  assert.equal(restored.simulation.cooling.networks[0]?.status,'READY');
  assert.ok(loadedVent.flowRate>0);
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
