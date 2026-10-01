import test from 'node:test';
import assert from 'node:assert/strict';
import {ContractHistorySystem} from '../../src/datacenter/ContractHistorySystem.js';
import {ContractCapacityPlanner} from '../../src/datacenter/contracts/ContractCapacityPlanner.js';
import {ComputeAllocationSystem} from '../../src/datacenter/compute/ComputeAllocationSystem.js';
import {ComputeCapacitySystem} from '../../src/datacenter/compute/ComputeCapacitySystem.js';
import {ComputeRack,ServerRack} from '../../src/entities/index.js';
import {World} from '../../src/world/World.js';
import {ContractCenterDataService} from '../../src/ui/datacenter/ContractCenterDataService.js';
import {ContractEquipmentResolver} from '../../src/ui/datacenter/ContractEquipmentResolver.js';
import {selectCommercialStats,classifyContract} from '../../src/ui/datacenter/ContractStatsSelectors.js';
import {renderMarketTab} from '../../src/ui/datacenter/tabs/ContractMarketTab.js';
import {renderActiveContractsTab} from '../../src/ui/datacenter/tabs/ActiveContractsTab.js';
import {renderStatisticsTab} from '../../src/ui/datacenter/tabs/ContractStatisticsTab.js';
import {renderHistoryTab} from '../../src/ui/datacenter/tabs/ContractHistoryTab.js';

const offer=(values={})=>({id:'offer-1',contractId:'contract-1',clientName:'A&B Cloud',productName:'Cloud CPU',modality:'compute',monthlyFee:30000,installationFee:2500,termDays:180,offeredDay:1,expiresDay:4,isNew:true,maxInletTemperature:32,availability:99.5,computeRequirements:{vcpu:16,ramGB:64,gpuCount:0,gpuMinVramGB:0,storageTB:5},...values});
function managerFixture(){
  const world=new World(12,12),rack=world.addEntity(new ComputeRack(2,2,{specialization:'cpu',modelId:'basic'}));
  const contracts=[{id:'cloud-active',clientName:'Cloud Client',productName:'Cloud CPU',modality:'compute',status:'active',monthlyFee:30000,acceptedDay:1,expiresDay:181,termDays:180,availability:99.5,maxInletTemperature:32,
    computeRequirements:{vcpu:16,ramGB:64,gpuCount:0,gpuMinVramGB:0,storageTB:0},allocations:[{assetId:rack.assetId,vcpu:16,ramGB:64,gpuDevices:[],storageTB:0}],activeSeconds:3600,uptimeSeconds:3600,allocationsRevision:1}];
  const capacity=new ComputeCapacitySystem(world,contracts),allocation=new ComputeAllocationSystem(capacity);
  const state={day:1,offers:[offer()],contracts,commercialHistoryRevision:1,commercialHistoryPartial:false,commercialDailyHistory:[],commercialEvents:[],cash:100000};
  return {world,rack,contracts,state,computeCapacity:capacity,computeAllocations:allocation,clock:{day:1},powerGrid:{capacityKW:100,remainingCapacityKW:80},cash:100000,availableEnergyKW:80,availableCoolingContractsKW:80,availableCoolingKW:80,committedPowerKW:20,committedCoolingKW:15,effectiveCoolingCapacityKW:50,
    planComputeOffer:item=>allocation.plan(item.computeRequirements),markOffersSeen(ids){for(const entry of state.offers)if(ids.includes(entry.id))entry.isNew=false;this.persist();},persist(){this.saved=true;},declineOffer(id){const index=state.offers.findIndex(item=>item.id===id);if(index<0)return false;state.offers.splice(index,1);return true;},worldCash:100000};
}

test('offer badge counts only new, unexpired offers and market viewing persists seen state',()=>{
  const manager=managerFixture(),service=new ContractCenterDataService(manager);manager.state.offers.push(offer({id:'expired',expiresDay:0,isNew:true}),offer({id:'seen',isNew:false}));
  assert.equal(service.newOfferCount(),1);assert.equal(service.markMarketViewed(),1);assert.equal(manager.state.offers.find(item=>item.id==='offer-1').isNew,false);assert.equal(manager.saved,true);
});

test('market cards expose commercial terms, feasibility analysis, escaped text, filters and actions',()=>{
  const manager=managerFixture(),service=new ContractCenterDataService(manager),ui={marketType:'all',marketCapacity:'all',marketSort:'revenue',marketAnalysis:'offer-1'};
  const html=renderMarketTab(manager,service,ui);assert.match(html,/A&amp;B Cloud/);assert.match(html,/16 vCPU · 64 GB RAM · 5 TB storage/);assert.match(html,/data-market-accept="offer-1"/);assert.match(html,/data-market-decline="offer-1"/);assert.match(html,/data-market-analyze="offer-1"/);assert.match(html,/Receita R\$ 30\.000\/mês/);
  const proposal=manager.state.offers[0];proposal.computeRequirements.storageTB=0;
  assert.equal(service.analyze(proposal).ok,true);
});

test('Cloud renewal offers that inherited an empty reservation are allocated anew',()=>{
  const world=new World(8,8),cpu=world.addEntity(new ComputeRack(1,1,{specialization:'cpu',modelId:'enterprise'})),contracts=[],capacity=new ComputeCapacitySystem(world,contracts),allocations=new ComputeAllocationSystem(capacity);
  const old={id:'old-cloud',status:'completed',modality:'compute',computeRequirements:{vcpu:48,ramGB:192},allocations:[],clientName:'Old',productName:'Cloud',monthlyFee:20000};
  const renewed={...old,id:'new-cloud',status:undefined,renewalContractId:old.id,offeredDay:3,expiresDay:8,termDays:90,monthlyFee:22000,isNew:true};
  contracts.push(old);const system=new ContractCapacityPlanner(allocations),result=allocations.commit({...renewed,allocations:undefined,status:'active'},renewed.computeRequirements);
  assert.equal(result.ok,true);assert.ok(result.allocations.length);assert.equal(result.allocations[0].assetId,cpu.assetId);
  const staleCopy={...renewed,allocations:[]};const reallocated=allocations.commit(staleCopy,renewed.computeRequirements);assert.equal(reallocated.ok,true);assert.ok(staleCopy.allocations.length);
});

test('active Cloud contracts with incomplete or empty resources are diagnosed as unprovisioned',()=>{
  const manager=managerFixture(),contract={id:'broken',modality:'compute',status:'active',computeRequirements:{vcpu:32,ramGB:128},allocations:[],computeDiagnostics:['Contrato sem recursos provisionados.']};
  manager.state.contracts.push(contract);assert.deepEqual(classifyContract(contract,manager),{key:'violated',label:'SEM PROVISIONAMENTO'});
});

test('Cloud and Colocation equipment resolve to physical assets without duplicate shared racks',()=>{
  const world=new World(10,10),cpu=world.addEntity(new ComputeRack(2,2,{specialization:'cpu',modelId:'basic'})),colocation=world.addEntity(new ServerRack(4,2,{contractId:'colo-1'}));
  const resolver=new ContractEquipmentResolver(world),cloud={id:'cloud-1',modality:'compute',allocations:[{assetId:cpu.assetId},{assetId:cpu.assetId}]};
  assert.deepEqual(resolver.resolve(cloud).map(entity=>entity.id),[cpu.id]);assert.deepEqual(resolver.resolve({id:'colo-1',modality:'colocation'}).map(entity=>entity.id),[colocation.id]);
});

test('active contract detail uses compute requirements and allocations instead of rackCount',()=>{
  const manager=managerFixture(),service=new ContractCenterDataService(manager),ui={activeFilter:'all',selectedContract:'cloud-active',cancelConfirm:null};
  const html=renderActiveContractsTab(manager,service,ui);assert.match(html,/16 vCPU/);assert.match(html,/64 GB/);assert.match(html,/Localizar no mapa/);assert.match(html,/Cloud Client/);
});

test('commercial daily history records actual income once, separates setup and preserves migration gaps',()=>{
  const state={day:4,commercialHistoryRevision:1,commercialDailyHistory:[],commercialEvents:[]},history=new ContractHistorySystem(state),contract={id:'contract-a',clientName:'Client',modality:'compute',monthlyFee:30000,computeRequirements:{vcpu:1,ramGB:1},allocations:[{assetId:'rack-a',vcpu:1,ramGB:1}]};
  history.recordEvent('signed',contract,4);assert.equal(history.recordSetup(contract,2500,4),2500);assert.equal(history.recordBilling(contract,4,1000),1000);assert.equal(history.recordBilling(contract,4,1000),0);
  history.recordPenalty(contract,4,5000);const day=history.finalizeDay(4,{energyCost:200,fixedCosts:300,otherExpenses:100,net:-999,contracts:[contract]});
  assert.equal(contract.totalRecurringRevenue,1000);assert.equal(contract.totalSetupRevenue,2500);assert.equal(contract.totalPenalties,5000);assert.equal(day.net,-2100);assert.equal(day.signedContracts,1);assert.equal(state.commercialDailyHistory.length,1);
  const restored=JSON.parse(JSON.stringify(state)),reload=new ContractHistorySystem(restored);assert.equal(reload.recordBilling(contract,4,1000),0);
  const legacy=new ContractHistorySystem({});assert.equal(legacy.state.commercialHistoryPartial,true);
});

test('statistics reflect only recorded history, actual setup and recurring income, and installed capacity',()=>{
  const manager=managerFixture();manager.state.commercialDailyHistory=[{day:1,recurringRevenue:700,setupRevenue:200,penalties:100,energyCost:60,fixedCosts:40,otherExpenses:0,net:700,revenueByModality:{compute:500,colocation:200},activeContracts:2,signedContracts:1}];
  const stats=selectCommercialStats(manager,'all');assert.equal(stats.realizedRevenue,900);assert.equal(stats.realizedRecurringRevenue,700);assert.equal(stats.setupRevenue,200);assert.equal(stats.penalties,100);assert.equal(stats.history.length,1);
  const html=renderStatisticsTab(manager,{statsPeriod:'all'});assert.match(html,/R\$ 900/);assert.match(html,/Ocupação computacional/);assert.match(html,/Receita realizada por dia/);
});

test('history separates completed and cancelled contracts and flags unknown legacy totals as unavailable',()=>{
  const manager=managerFixture();manager.state.commercialHistoryPartial=true;manager.state.contracts.push({id:'old',clientName:'Legacy Client',productName:'Cloud CPU',modality:'compute',status:'cancelled',monthlyFee:12000,acceptedDay:1,commercialEndedDay:3,computeRequirements:{vcpu:4,ramGB:16},allocations:[],totalRecurringRevenue:0});
  const html=renderHistoryTab(manager,{historyState:'all',historyType:'all',historySearch:''});assert.match(html,/Legacy Client/);assert.match(html,/Indisponível · save anterior sem acumulador/);assert.match(html,/Cancelados/);
});

test('commercial views are accessible and all four tabs retain independent user filter state',()=>{
  const manager=managerFixture(),service=new ContractCenterDataService(manager),state={marketType:'all',marketCapacity:'all',marketSort:'revenue',marketAnalysis:null,activeFilter:'all',selectedContract:null,cancelConfirm:null,statsPeriod:'7',historyState:'cancelled',historyType:'cloud',historySearch:'Acme'};
  assert.match(renderMarketTab(manager,service,state),/data-market-type/);assert.match(renderActiveContractsTab(manager,service,state),/data-active-filter/);assert.match(renderStatisticsTab(manager,state),/value="7" selected/);assert.match(renderHistoryTab(manager,state),/value="cancelled" selected/);assert.equal(state.historySearch,'Acme');
});
