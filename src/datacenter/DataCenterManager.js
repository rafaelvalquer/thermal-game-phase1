import { powerEquipment, isPowered } from '../simulation/PowerState.js';
import { GameClock } from './GameClock.js';
import { ContractSystem } from './ContractSystem.js';
import { RackSystem } from './RackSystem.js';
import { DataCenterSaveSystem } from './DataCenterSaveSystem.js';
import { PowerGridSystem, POWER_MAX_CAPACITY_KW } from './PowerGridSystem.js';
import { ServerRack } from '../entities/ServerRack.js';
import { createDailyOperations, normalizeDailyState, sampleDailyOperations, summarizeDailyOperations } from './DailyOperations.js';
import { ReputationSystem } from './ReputationSystem.js';
import { ComputeCapacitySystem } from './compute/ComputeCapacitySystem.js';
import { ComputeAllocationSystem } from './compute/ComputeAllocationSystem.js';
import { ComputeLoadSystem } from './compute/ComputeLoadSystem.js';
import { ComputeSlaSystem } from './compute/ComputeSlaSystem.js';
import { ContractCapacityPlanner } from './contracts/ContractCapacityPlanner.js';

const DEFAULT_STATE=()=>({cash:150000,clockSeconds:0,day:1,reputation:50,powerCapacityKW:100,energyTariff:0.55,
  offerSequence:0,offers:[],marketInitialized:false,contracts:[],pendingExpansionOffer:null,lastExpansionInviteByClient:{},ledger:[],dailyViolation:false,lastPowerEnergy:0,rackSequence:0,
  reputationHistory:[],dailyPositiveReputation:0,reputationStreakDays:0,computeCommercialRevision:1});

export class DataCenterManager {
  constructor(world,level,{saveSystem=new DataCenterSaveSystem(),random=Math.random}={}){
    this.world=world;this.level=level;this.saveSystem=saveSystem;this.random=random;this.snapshot=saveSystem.load();
    const defaults=DEFAULT_STATE();defaults.cash=level.datacenter.initialCash??defaults.cash;defaults.powerCapacityKW=level.datacenter.powerCapacityKW??defaults.powerCapacityKW;defaults.energyTariff=level.datacenter.energyTariff??defaults.energyTariff;defaults.coolingMaintenanceDaily=level.datacenter.coolingMaintenanceDaily??110;
    this.state={...defaults,...(this.snapshot?.state||{})};
    // Bring existing sandbox saves onto the new base electricity tariff while
    // preserving custom tariffs configured by other scenarios.
    if(level.datacenter.energyTariff===0.55&&this.snapshot?.state?.energyTariff===0.85)this.state.energyTariff=0.55;
    normalizeDailyState(this.state,this.snapshot?.state);
    this.reputation=new ReputationSystem(this.state);
    this.clock=new GameClock(this.state.clockSeconds);
    this.powerGrid=new PowerGridSystem({capacityKW:this.state.powerCapacityKW,...this.state.powerProtection});
    this.contracts=new ContractSystem(this.state,{random:this.random});
    this.racks=new RackSystem(world,this.contracts);
    this.computeCapacity=new ComputeCapacitySystem(world,this.state.contracts);
    this.computeAllocations=new ComputeAllocationSystem(this.computeCapacity);
    this.contracts.computeAllocations=this.computeAllocations;
    this.contracts.computePlanner=new ContractCapacityPlanner(this.computeAllocations);
    this.contracts.computePreflight=offer=>this.planComputeOffer(offer);
    this.computeLoad=new ComputeLoadSystem(world,this.state.contracts);this.computeSla=new ComputeSlaSystem(world);
    this.build=null;this.simulation=null;this.saveTimer=0;this.saveDirty=false;this.saveDebounceRemaining=0;
    world.datacenter=this;world.datacenterConfig=level.datacenter;
    if(this.snapshot)saveSystem.restoreWorld(world,this.snapshot);
    this.computeSla.refreshDiagnostics(this.state.contracts);
    this.powerGrid.refresh(world);
  }
  get computeCapacitySummary(){return this.computeCapacity.snapshot();}
  planComputeOffer(offer){
    const plan=this.contracts.computePlanner?.analyze(offer)||this.computeAllocations.plan(offer?.computeRequirements);
    if(!plan.ok)return plan;
    const currentlyReserved=new Set(this.state.contracts.filter(contract=>contract.modality==='compute'&&contract.status==='active').flatMap(contract=>(contract.allocations||[]).map(item=>item.assetId)));
    const allocations=new Map(this.world.entitiesByType('computeRack').map(rack=>[rack.assetId,rack]));
    let additionalPowerKW=0,additionalCoolingKW=0;
    for(const allocation of plan.allocations){
      if(currentlyReserved.has(allocation.assetId))continue;
      const rack=allocations.get(allocation.assetId);if(!rack)continue;
      const powered=rack.enabled&&!rack.powerBlocked,drawW=powered?Math.max(0,rack.currentPowerW||rack.power||0):0;
      const heatW=powered?Math.max(0,rack.heatGenerationPower||rack.heatOutput||drawW):0;
      additionalPowerKW+=Math.max(0,rack.maxPowerW-drawW)/1000;
      additionalCoolingKW+=Math.max(0,rack.maxPowerW-heatW)/1000;
    }
    const freePowerKW=Math.max(0,this.powerGrid.capacityKW-this.committedFacilityPowerKW);
    const unreservedComputeHeatKW=this.world.entitiesByType('computeRack').reduce((sum,rack)=>sum+(!currentlyReserved.has(rack.assetId)?Math.max(0,rack.heatGenerationPower||0)/1000:0),0);
    const freeCoolingKW=Math.max(0,this.effectiveCoolingCapacityKW-this.committedCoolingKW-unreservedComputeHeatKW);
    const missing=[...(plan.missing||[])];
    if(additionalPowerKW>freePowerKW+1e-6)missing.push({resource:'Potência elétrica',requested:additionalPowerKW,available:freePowerKW,missing:additionalPowerKW-freePowerKW,unit:'kW'});
    if(additionalCoolingKW>freeCoolingKW+1e-6)missing.push({resource:'Capacidade de refrigeração',requested:additionalCoolingKW,available:freeCoolingKW,missing:additionalCoolingKW-freeCoolingKW,unit:'kW'});
    return {...plan,ok:missing.length===0,missing,additionalPowerKW,additionalCoolingKW,freePowerKW,freeCoolingKW,
      reason:missing.length?'A infraestrutura elétrica ou térmica não consegue garantir este contrato.':null};
  }
  attach(build,simulation){
    this.build=build;this.simulation=simulation;
    this.world.onPowerEquipmentIndexed=equipment=>{if(this.powerGrid.breakerOpen)equipment.powerBlocked=true;};
    build.budget=this.state.cash;
    if(this.snapshot)this.saveSystem.restoreBuild(build,this.snapshot);
    this.level.powerLimit=this.powerGrid.capacityKW*1000;
    simulation.metrics.powerEnergy=this.state.powerEnergyTotal;
    if(this.snapshot)simulation.cooling?.rebuild();
    simulation.paused=Boolean(this.state.reportPending);
    this.persist();
  }
  get cash(){return this.build?.budget??this.state.cash;}
  get nextPowerTier(){return this.powerGrid.capacityKW<POWER_MAX_CAPACITY_KW?{capacityKW:POWER_MAX_CAPACITY_KW}:null;}
  get rackCount(){return this.world.entitiesByType('serverRack').length;}
  get activeContracts(){return this.state.contracts.filter(contract=>contract.status==='active');}
  get clientCount(){return new Set(this.state.contracts.filter(contract=>['active','installing'].includes(contract.status)).map(contract=>contract.clientName)).size;}
  get serverPowerKW(){return [...this.world.entitiesByType('serverRack'),...this.world.entitiesByType('computeRack')].reduce((sum,rack)=>sum+(rack.power||0)/1000,0);}
  get facilityPowerKW(){return (this.simulation?.metrics.powerDraw||0)/1000;}
  get pue(){return this.serverPowerKW>0?this.facilityPowerKW/this.serverPowerKW:null;}
  get currentContractRackPowerKW(){
    const liveIds=new Set(this.state.contracts.filter(contract=>['active','installing'].includes(contract.status)).map(contract=>contract.id));
    const coloc=this.world.entitiesByType('serverRack').reduce((sum,rack)=>sum+(
      liveIds.has(rack.contractId)?(rack.power||0)/1000:0
    ),0);
    const computeIds=new Set(this.state.contracts.filter(contract=>contract.modality==='compute'&&contract.status==='active').flatMap(contract=>(contract.allocations||[]).map(item=>item.assetId)));
    return coloc+this.world.entitiesByType('computeRack').reduce((sum,rack)=>sum+(computeIds.has(rack.assetId)?(rack.power||0)/1000:0),0);
  }
  get otherFacilityPowerKW(){return Math.max(0,this.facilityPowerKW-this.currentContractRackPowerKW);}
  get computeCommittedPowerKW(){
    const reservedIds=new Set(this.state.contracts.filter(contract=>contract.modality==='compute'&&contract.status==='active').flatMap(contract=>(contract.allocations||[]).map(item=>item.assetId)));
    return this.world.entitiesByType('computeRack').reduce((sum,rack)=>sum+(reservedIds.has(rack.assetId)?rack.maxPowerW/1000:0),0);
  }
  get committedPowerKW(){return this.state.contracts.reduce((sum,contract)=>
    ['active','installing'].includes(contract.status)&&contract.modality!=='compute'?sum+contract.rackCount*contract.powerPerRackKW:sum,0)+this.computeCommittedPowerKW;}
  get committedFacilityPowerKW(){return this.committedPowerKW+this.otherFacilityPowerKW;}
  get contractedPowerKW(){return this.powerGrid.capacityKW;}
  get powerReserveKW(){return this.contractedPowerKW-this.committedPowerKW;}
  get availableEnergyKW(){return Math.max(0,this.powerReserveKW);}
  get currentRackHeatKW(){return [...this.world.entitiesByType('serverRack'),...this.world.entitiesByType('computeRack')].reduce((sum,rack)=>sum+(
    Number.isFinite(rack.heatGenerationPower)?rack.heatGenerationPower/1000:(rack.heatOutputKW||0)
  ),0);}
  get committedCoolingKW(){const coloc=this.state.contracts.reduce((sum,contract)=>['active','installing'].includes(contract.status)&&contract.modality!=='compute'?sum+contract.rackCount*contract.powerPerRackKW:sum,0);return coloc*.98+this.computeCommittedPowerKW;}
  get effectiveCoolingCapacityKW(){return (this.simulation?.metrics.coolingAvailableCapacity||0)/1000;}
  // Kept as an alias for callers that used this name for effective available capacity.
  get installedCoolingKW(){return this.effectiveCoolingCapacityKW;}
  get coolingReserveKW(){return this.effectiveCoolingCapacityKW-this.committedCoolingKW;}
  get rackCoolingDemandKW(){return this.currentRackHeatKW;}
  get availableCoolingKW(){return Math.max(0,this.coolingReserveKW);}
  get availableCoolingContractsKW(){return this.availableCoolingKW/.98;}
  get capacityForNewContractsKW(){return Math.min(this.availableEnergyKW,this.availableCoolingContractsKW);}
  get bottleneckResource(){
    const cooling=this.availableCoolingKW,energy=this.availableEnergyKW;
    const ratios=[{name:'energia',headroom:this.powerGrid.capacityKW?energy/this.powerGrid.capacityKW:0},{name:'refrigeração',headroom:this.installedCoolingKW?cooling/this.installedCoolingKW:0}];
    return ratios.sort((a,b)=>a.headroom-b.headroom)[0].name;
  }

  nextRackPlacement(){
    const contract=this.contracts.nextInstallation();if(!contract)return null;
    const rackNumber=contract.installedRacks+1;
    return {clientId:contract.clientName,contractId:contract.id,maxPowerKW:contract.powerPerRackKW,
      currentPowerKW:0,heatOutputKW:0,inletTemperature:25,exhaustTemperature:25,cpuLoad:0,uptime:100,status:'INSTALLING',
      slaTemperature:contract.maxInletTemperature,loadProfile:contract.loadProfile,clientName:contract.clientName,rackNumber};
  }
  assignRackToContract(rack,contract,rackNumber){
    rack.contractId=contract.id;rack.clientId=contract.clientName;rack.clientName=contract.clientName;
    rack.maxPowerKW=contract.powerPerRackKW;rack.baseHeatOutput=contract.powerPerRackKW*980;
    rack.heatOutput=rack.baseHeatOutput;rack.heatOutputKW=0;rack.heatGenerationPower=0;
    rack.currentPowerKW=0;rack.requestedPower=0;rack.power=0;rack.enabled=true;rack.powerBlocked=false;
    rack.cpuLoad=0;rack.loadMultiplier=0;rack.loadProfile=contract.loadProfile;
    rack.slaTemperature=contract.maxInletTemperature;rack.status='INSTALLING';rack.started=false;
    rack.name=contract.clientName+' #'+String(rackNumber).padStart(2,'0');
    rack.thermalViolationSeconds=0;rack.uptimeSeconds=0;rack.downtimeSeconds=0;rack.uptime=100;
  }
  releaseContractRacks(contractId){
    for(const rack of this.world.entitiesByType('serverRack'))if(rack.contractId===contractId)this.racks.release(rack);
  }
  assignAvailableRacks(contract){
    // Older saves may still have racks attached to a contract that has ended.
    for(const rack of this.world.entitiesByType('serverRack'))if(rack.contractId){
      const owner=this.state.contracts.find(item=>item.id===rack.contractId);
      if(!owner||!['installing','active'].includes(owner.status))this.racks.release(rack);
    }
    const available=this.world.entitiesByType('serverRack').filter(rack=>rack.status==='CANCELLED'&&!rack.contractId);
    for(const rack of available.slice(0,contract.rackCount)){
      this.assignRackToContract(rack,contract,contract.installedRacks+1);
      this.contracts.attachRack(rack);
    }
  }
  onRackPlaced(rack){this.contracts.attachRack(rack);this.markSaveDirty();}
  onRackRemoved(rack){
    const contract=this.state.contracts.find(item=>item.id===rack.contractId);if(!contract)return;
    contract.installedRacks=Math.max(0,contract.installedRacks-1);
    if(contract.status==='active')contract.status='installing';
    this.persist();
  }
  acceptOffer(offerId){
    const result=this.contracts.accept(offerId,this.clock.day,this.cash);
    if(!result.ok)return result;
    if(!result.alreadyAccepted&&result.contract.renewalContractId)this.reputation.change(1,'Renovação de contrato · '+result.contract.clientName,this.clock.day);
    if(!result.alreadyAccepted&&result.contract.modality!=='compute')this.assignAvailableRacks(result.contract);
    this.build.budget+=result.installationIncome;
    if(!result.alreadyAccepted)this.record(result.contract.modality==='compute'?'Provisionamento Cloud · '+result.contract.clientName:'Instalação · '+result.contract.clientName,result.installationIncome);
    this.persist();this.build.onChange?.();return result;
  }
  declineOffer(offerId){const declined=this.contracts.decline(offerId);if(declined)this.persist();return declined;}
  cancelContract(contractId){
    const contract=this.state.contracts.find(item=>item.id===contractId);
    if(!this.contracts.cancel(contractId)){return false;}
    this.reputation.change(-2,'Cancelamento manual',this.clock.day);
    contract.reputationProcessed=true;
    this.releaseContractRacks(contractId);
    this.record('Cancelamento · '+contract.clientName,0);this.persist();return true;
  }
  upgradePower(addedKW){
    const result=this.powerGrid.upgrade(Number(addedKW),this.cash);
    if(!result.ok)return result;
    this.build.budget-=result.cost;this.state.powerCapacityKW=result.capacityKW;
    this.level.powerLimit=result.capacityKW*1000;this.record('Instalação de rede · +'+result.addedKW+' kW ('+result.capacityKW+' kW total)',-result.cost);
    this.persist();return result;
  }
  update(dt){
    this.clock.advance(dt);this.state.clockSeconds=this.clock.seconds;
    this.racks.update(dt,this.clock);
  }
  preparePowerDemand(dt){
    this.computeLoad.update(this.clock);
    this.racks.update(0,this.clock);
    // Independent racks retain their requested draw while physically disconnected.
    for(const e of powerEquipment(this.world)){
      if(e.type==='serverRack'&&!e.contractId){e.requestedPower=e.powerBlocked||this.powerGrid.breakerOpen?(e.requestedPower??e.power):e.power;if(this.powerGrid.breakerOpen&&e.enabled)e.powerBlocked=false;}
    }
    this.simulation?.cooling?.prepareFrame(dt,{ignorePowerBlock:true});
  }
  protectPower(dt,billingDt=dt){
    this.preparePowerDemand(dt||this.simulation?.lastPhysicsDt||1/60);
    this.simulation?.batteryDispatch?.dispatch(this.powerGrid.capacityKW*1000,billingDt||dt,{disabled:this.powerGrid.breakerOpen});
    const wasOpen=this.powerGrid.breakerOpen;
    this.powerGrid.update(this.world,dt);
    if(!wasOpen&&this.powerGrid.breakerOpen)this.state.powerOutageOccurredToday=true;
  }
  rearmPower(){
    this.preparePowerDemand(this.simulation?.lastPhysicsDt||1/60);
    this.simulation?.batteryDispatch?.dispatch(this.powerGrid.capacityKW*1000,0,{disabled:false});
    if(this.powerGrid.breakerOpen)for(const equipment of powerEquipment(this.world))if(equipment.enabled)equipment.powerBlocked=false;
    const result=this.powerGrid.rearm(this.world);
    this.racks.update(0,this.clock);
    this.simulation?.cooling?.update(this.simulation?.lastPhysicsDt||1/60,{prepareOnly:true});
    if(this.simulation)this.simulation.metrics.powerDraw=this.simulation.batteryDispatch.currentGridPowerW({breakerOpen:this.powerGrid.breakerOpen});
    this.persist();return result;
  }
  afterThermalStep(dt,simulationDt=dt){
    // Refresh inlet readings after thermal transport before accounting for SLA.
    this.racks.update(0,this.clock);
    this.racks.afterThermalStep(dt,simulationDt);
    this.computeSla.afterThermalStep(this.state.contracts,dt,simulationDt);
    sampleDailyOperations(this.state.dailyOperations,this.simulation.metrics,this.serverPowerKW,dt);
    if(this.clock.day>this.state.lastSettledDay+1)this.settleDay(this.clock.day);
  }
  settleDay(day){
    if(day-1<=this.state.lastSettledDay)return null;
    const metrics=this.simulation?.metrics||{powerEnergy:0},energyJoules=Math.max(0,(metrics.powerEnergy||0)-this.state.lastPowerEnergy);
    const energyKWh=energyJoules/3600000,energyCost=energyKWh*this.state.energyTariff;
    this.state.lastPowerEnergy=metrics.powerEnergy||0;
    this.racks.evaluateDailyAvailability();this.computeSla.evaluateDailyAvailability(this.state.contracts);
    const violations=new Set(this.state.contracts.filter(contract=>contract.status==='active'&&contract.dailyViolation).map(contract=>contract.id));
    const reputationStart=this.reputation.value,reputationTierStart=this.reputation.tier;
    this.reputation.startDay();
    const operatingContracts=[...this.activeContracts];
    const billableContracts=[...operatingContracts,...this.state.contracts.filter(contract=>contract.modality==='compute'&&contract.status==='cancelled'&&contract.dailyActiveSeconds>0)];
    const activeSecondsAtClose=new Map(billableContracts.map(contract=>[contract.id,contract.dailyActiveSeconds||0]));
    const sla={operatingCount:operatingContracts.length,violations:operatingContracts.filter(contract=>violations.has(contract.id)).map(contract=>({id:contract.id,clientName:contract.clientName}))};
    for(const contract of operatingContracts)if(!violations.has(contract.id)&&contract.dailyActiveSeconds>0&&
      contract.dailyUptimeSeconds/contract.dailyActiveSeconds>=.9995)this.reputation.changeDaily(.05,'Disponibilidade excelente · '+contract.clientName,day);
    for(const contract of operatingContracts)if(contract.dailyDowntimeSeconds>=21600)
      this.reputation.change(-3,'Indisponibilidade crítica prolongada · '+contract.clientName,day);
    this.contracts.updateDay(day);
    for(const contract of this.state.contracts)if(['completed','cancelled'].includes(contract.status))this.releaseContractRacks(contract.id);
    for(const contract of this.state.contracts)if(['completed','cancelled'].includes(contract.status)&&contract.modality==='compute')this.computeAllocations.release(contract);
    let revenue=0,penalties=0;
    for(const contract of this.state.contracts){
      if(billableContracts.includes(contract)){
        const activeSeconds=activeSecondsAtClose.get(contract.id)||0,activeDayFraction=activeSeconds>0?Math.min(1,activeSeconds/86400):1;
        const dailyRevenue=contract.monthlyFee/30*activeDayFraction;revenue+=dailyRevenue;
      }
      if(violations.has(contract.id)){
        contract.lastSlaViolationDay=day;
        penalties+=5000;contract.finesPaid+=5000;this.reputation.change(-1,'Violação de SLA · '+contract.clientName,day);
      }
      if(contract.status==='completed'&&contract.completedDay===day&&!contract.reputationProcessed){
        this.reputation.change(2,'Contrato concluído · '+contract.clientName,day);
        if(!contract.violationDays)this.reputation.change(1,'Histórico perfeito de SLA · '+contract.clientName,day);
        contract.reputationProcessed=true;
      }
      if(contract.status==='cancelled'&&contract.cancelledDay===day&&!contract.reputationProcessed){
        const installationFailed=contract.cancelReason==='Prazo de instalação expirado',penalty=contract.cancelReason==='Cancelado pelo operador'?-2:installationFailed?-4:-5;
        this.reputation.change(penalty,contract.cancelReason==='Cancelado pelo operador'?'Cancelamento manual · '+contract.clientName:installationFailed?'Incapacidade de iniciar operação · '+contract.clientName:'Contrato cancelado após violações · '+contract.clientName,day);
        contract.reputationProcessed=true;
      }
    }
    const allSlaMet=operatingContracts.length>0&&!violations.size;
    if(allSlaMet)this.reputation.changeDaily(.05,'Todos os contratos cumpriram o SLA',day);
    const cleanActive=operatingContracts.filter(contract=>!violations.has(contract.id)).length;
    if(cleanActive)this.reputation.changeDaily(cleanActive*.015,'Operação estável',day);
    if(violations.size){this.state.reputationStreakDays=0;}
    else if(operatingContracts.length){
      this.state.reputationStreakDays++;
      if(this.state.reputationStreakDays>0&&this.state.reputationStreakDays%30===0)this.reputation.change(1,'30 dias sem violação de SLA',day);
    }
    if(this.state.powerOutageOccurredToday){this.reputation.change(-2,'Falha grave de energia',day);this.state.powerOutageOccurredToday=false;}
    const fixedPowerCost=this.powerGrid.monthlyFixedCost/30,coolingMaintenance=this.state.coolingMaintenanceDaily??110;
    const staffPayroll=this.world.technicianSystem?.settleDay(day-1)||0;
    const expenses=energyCost+fixedPowerCost+coolingMaintenance+penalties+staffPayroll,net=revenue-expenses;
    this.build.budget+=net;
    this.state.day=day;this.state.clockSeconds=this.clock.seconds;
    this.record('Dia '+(day-1)+' · receitas',revenue,day-1);
    this.record('Energia · '+energyKWh.toFixed(1)+' kWh',-energyCost,day-1);
    this.record('Contrato elétrico e climatização',-(fixedPowerCost+coolingMaintenance),day-1);
    if(penalties)this.record('Multas de SLA',-penalties,day-1);
    if(staffPayroll)this.record('Salários da equipe técnica',-staffPayroll,day-1);
    // Generation uses post-settlement reputation plus the live built rack count and power-grid capacity.
    this.state.rackCount=this.rackCount;
    this.state.powerCapacityKW=this.powerGrid.capacityKW;
    const newOffers=this.contracts.generateDaily(day,this.state.reputation).map(offer=>({...offer}));
    const renewalContract=this.state.contracts.find(contract=>contract.status==='completed'&&contract.completedDay===day&&!contract.renewalOfferChecked);
    const renewalOffer=this.contracts.generateRenewalOffer(renewalContract,day,this.state.reputation);
    if(renewalOffer)newOffers.push({...renewalOffer});
    this.contracts.generateExpansionOffer(day,this.state.reputation,violations);
    const reputationTierEnd=this.reputation.tier;
    this.state.dailyResult={day:day-1,revenue,energyCost,fixedPowerCost,coolingMaintenance,penalties,staffPayroll,net,energyKWh,
      reputation:{start:reputationStart,end:this.reputation.value,change:this.reputation.value-reputationStart,tierStart:reputationTierStart.name,tierEnd:reputationTierEnd.name,tierChanged:reputationTierStart.id!==reputationTierEnd.id,history:this.state.reputationHistory.filter(event=>event.day===day)},
      operations:summarizeDailyOperations(this.state.dailyOperations),sla,newOffers};
    this.state.dailyOperations=createDailyOperations();
    this.state.lastSettledDay=day-1;
    this.state.reportPending=this.state.pauseOnNewContracts;
    this.state.notificationPending=!this.state.pauseOnNewContracts;
    if(this.state.reportPending&&this.simulation)this.simulation.paused=true;
    this.persist();
    return this.state.dailyResult;
  }
  setPauseOnNewContracts(value){this.state.pauseOnNewContracts=Boolean(value);this.persist();}
  respondToExpansionOffer(accept){
    const offer=this.state.pendingExpansionOffer;if(!offer)return {ok:false,reason:'Não há proposta de expansão pendente.'};
    const contract=this.state.contracts.find(item=>item.id===offer.contractId&&item.status==='active');
    if(!contract){this.state.pendingExpansionOffer=null;this.persist();return {ok:false,reason:'O contrato desta proposta não está mais ativo.'};}
    this.state.pendingExpansionOffer=null;
    if(!accept){this.record('Proposta de expansão recusada · '+contract.clientName,0);this.persist();return {ok:true,accepted:false,contract};}
    contract.rackCount=offer.rackCount;contract.powerPerRackKW=offer.powerPerRackKW;
    contract.monthlyFee=offer.monthlyFee;contract.installationFee=(contract.installationFee||0)+offer.installationFee;
    contract.baseMonthlyFee=Math.round((contract.baseMonthlyFee||contract.monthlyFee)*(offer.capacityKW/offer.currentCapacityKW));
    contract.reputationMultiplier=contract.baseMonthlyFee?contract.monthlyFee/contract.baseMonthlyFee:1;
    contract.expiresDay=offer.expiresDay;contract.lastAmendedDay=this.clock.day;contract.amendmentCount=(contract.amendmentCount||0)+1;
    for(const rack of this.world.entitiesByType('serverRack'))if(rack.contractId===contract.id){
      rack.maxPowerKW=contract.powerPerRackKW;rack.baseHeatOutput=contract.powerPerRackKW*980;rack.heatOutput=rack.baseHeatOutput;
    }
    this.build.budget+=offer.installationFee;
    this.record('Aditivo de expansão · '+contract.clientName,offer.installationFee);
    this.persist();this.build.onChange?.();
    return {ok:true,accepted:true,contract,offer};
  }
  markOffersSeen(ids){if(this.contracts.markSeen(ids))this.markSaveDirty();}
  dismissReport(){this.state.reportPending=false;this.persist();}
  consumeNotification(){
    if(!this.state.notificationPending)return null;
    this.state.notificationPending=false;this.persist();return this.state.dailyResult;
  }
  record(description,amount,day=this.clock.day){
    this.state.ledger.unshift({day,description,amount});
    if(this.state.ledger.length>60)this.state.ledger.length=60;
  }
  updateAutoSave(realDt){
    this.saveTimer+=realDt;
    if(this.saveDirty){this.saveDebounceRemaining-=realDt;if(this.saveDebounceRemaining<=1e-9){this.persist();return;}}
    if(this.saveTimer>=15-1e-9)this.persist();
  }
  markSaveDirty(debounceSeconds=2){
    this.saveDirty=true;this.saveDebounceRemaining=Math.max(0,Number(debounceSeconds)||0);
  }
  persist({syncBackup=false}={}){
    if(!this.build)return false;
    this.monitor?.begin('saveMs');
    this.state.cash=this.build.budget;this.state.clockSeconds=this.clock.seconds;this.state.day=this.clock.day;
    this.state.powerCapacityKW=this.powerGrid.capacityKW;
    this.state.powerProtection=this.powerGrid.snapshot();
    this.state.powerEnergyTotal=this.simulation?.metrics.powerEnergy||0;
    this.state.saveRevision=(Number(this.state.saveRevision)||0)+1;
    let saved=false;
    try{
      const snapshot=this.saveSystem.capture(this.world,this.state,this.build);
      const result=syncBackup?this.saveSystem.save(snapshot):(this.saveSystem.saveAsync?.(snapshot)??this.saveSystem.save(snapshot));
      if(result&&typeof result.then==='function'){
        saved=true;this.lastSavePromise=result;
        result.then(ok=>{if(!ok)this.lastSaveError=new Error('Não foi possível gravar o salvamento.');}).catch(error=>{this.lastSaveError=error;});
      }else saved=Boolean(result);
      if(saved){this.saveTimer=0;this.saveDirty=false;this.saveDebounceRemaining=0;}return saved;
    }
    finally{const duration=this.monitor?.end('saveMs')||0,bytes=this.saveSystem.lastSavedBytes||0,phases=this.saveSystem.lastCapturePhases||{};this.monitor?.set?.('saveCaptureMs',this.saveSystem.lastCaptureMs||0);this.monitor?.set?.('saveStateMs',phases.state||0);this.monitor?.set?.('saveTilesMs',phases.tiles||0);this.monitor?.set?.('saveEntitiesMs',phases.entities||0);this.monitor?.set?.('saveUtilitiesMs',phases.utilities||0);this.monitor?.set?.('saveBuildMs',phases.build||0);this.monitor?.set?.('saveSerializeMs',this.saveSystem.lastSerializeMs||0);this.monitor?.set?.('saveStorageMs',this.saveSystem.lastStorageMs||0);this.monitor?.set?.('saveBytes',bytes);this.monitor?.set?.('saveBytesEstimated',Boolean(this.saveSystem.lastSavedBytesEstimated));this.monitor?.recordSave?.(duration,bytes);}
  }
  clearSave(){
    if(!this.saveSystem.indexedDB?.open)return this.saveSystem.clear();
    const result=this.saveSystem.clearAsync?.()??this.saveSystem.clear();this.saveSystem.clear();return result;
  }
  load(){
    const snapshot=this.saveSystem.load();if(!snapshot)return false;
    this.snapshot=snapshot;this.saveSystem.restoreWorld(this.world,snapshot);
    this.state={...DEFAULT_STATE(),...snapshot.state};normalizeDailyState(this.state,snapshot.state);this.reputation=new ReputationSystem(this.state);this.clock=new GameClock(this.state.clockSeconds);
    if(this.world.technicianSystem)this.world.technicianSystem.payrollDay=this.state.lastSettledDay||0;
    this.powerGrid=new PowerGridSystem({capacityKW:this.state.powerCapacityKW,...this.state.powerProtection});this.contracts=new ContractSystem(this.state,{random:this.random});
    this.racks=new RackSystem(this.world,this.contracts);this.computeCapacity.setContracts(this.state.contracts);this.computeAllocations=new ComputeAllocationSystem(this.computeCapacity);this.contracts.computeAllocations=this.computeAllocations;this.contracts.computePlanner=new ContractCapacityPlanner(this.computeAllocations);this.contracts.computePreflight=offer=>this.planComputeOffer(offer);this.computeLoad=new ComputeLoadSystem(this.world,this.state.contracts);this.computeSla=new ComputeSlaSystem(this.world);this.saveSystem.restoreBuild(this.build,snapshot);this.computeSla.refreshDiagnostics(this.state.contracts);
    this.world.datacenter=this;this.world.onPowerEquipmentIndexed=equipment=>{if(this.powerGrid.breakerOpen)equipment.powerBlocked=true;};this.level.powerLimit=this.powerGrid.capacityKW*1000;
    this.powerGrid.refresh(this.world);
    this.simulation.cooling?.rebuild();
    Object.assign(this.simulation.metrics,{generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:this.state.powerEnergyTotal,energyBalance:0,maxTempEver:25,maxPowerEver:0});
    this.simulation.energySystem.initialize();this.simulation.updateMetrics();this.simulation.mission.lastEventMessage='';
    this.simulation.paused=Boolean(this.state.reportPending);this.simulation.elapsed=this.clock.seconds;
    return true;
  }
  upgradeOptions(){return {minKW:1,maxKW:this.powerGrid.remainingCapacityKW};}
}
