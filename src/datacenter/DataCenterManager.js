import { powerEquipment, isPowered } from '../simulation/PowerState.js';
import { GameClock } from './GameClock.js';
import { ContractSystem } from './ContractSystem.js';
import { RackSystem } from './RackSystem.js';
import { DataCenterSaveSystem } from './DataCenterSaveSystem.js';
import { PowerGridSystem, POWER_MAX_CAPACITY_KW } from './PowerGridSystem.js';
import { ServerRack } from '../entities/ServerRack.js';
import { createDailyOperations, normalizeDailyState, sampleDailyOperations, summarizeDailyOperations } from './DailyOperations.js';

const DEFAULT_STATE=()=>({cash:150000,clockSeconds:0,day:1,reputation:50,powerCapacityKW:100,energyTariff:0.85,
  offerSequence:0,offers:[],marketInitialized:false,contracts:[],pendingExpansionOffer:null,ledger:[],dailyViolation:false,lastPowerEnergy:0,rackSequence:0});
const clampReputation=value=>Math.max(0,Math.min(100,value));

export class DataCenterManager {
  constructor(world,level,{saveSystem=new DataCenterSaveSystem(),random=Math.random}={}){
    this.world=world;this.level=level;this.saveSystem=saveSystem;this.random=random;this.snapshot=saveSystem.load();
    const defaults=DEFAULT_STATE();defaults.cash=level.datacenter.initialCash??defaults.cash;defaults.powerCapacityKW=level.datacenter.powerCapacityKW??defaults.powerCapacityKW;defaults.energyTariff=level.datacenter.energyTariff??defaults.energyTariff;defaults.coolingMaintenanceDaily=level.datacenter.coolingMaintenanceDaily??110;
    this.state={...defaults,...(this.snapshot?.state||{})};
    normalizeDailyState(this.state,this.snapshot?.state);
    this.clock=new GameClock(this.state.clockSeconds);
    this.powerGrid=new PowerGridSystem({capacityKW:this.state.powerCapacityKW,...this.state.powerProtection});
    this.contracts=new ContractSystem(this.state,{random:this.random});
    this.racks=new RackSystem(world,this.contracts);
    this.build=null;this.simulation=null;this.saveTimer=0;
    world.datacenter=this;world.datacenterConfig=level.datacenter;
    if(this.snapshot)saveSystem.restoreWorld(world,this.snapshot);
    this.powerGrid.refresh(world);
  }
  attach(build,simulation){
    this.build=build;this.simulation=simulation;
    build.budget=this.state.cash;
    if(this.snapshot)this.saveSystem.restoreBuild(build,this.snapshot);
    this.level.powerLimit=this.powerGrid.capacityKW*1000;
    simulation.metrics.powerEnergy=this.state.powerEnergyTotal;
    simulation.paused=Boolean(this.state.reportPending);
    this.persist();
  }
  get cash(){return this.build?.budget??this.state.cash;}
  get nextPowerTier(){return this.powerGrid.capacityKW<POWER_MAX_CAPACITY_KW?{capacityKW:POWER_MAX_CAPACITY_KW}:null;}
  get rackCount(){return this.world.entitiesByType('serverRack').length;}
  get activeContracts(){return this.state.contracts.filter(contract=>contract.status==='active');}
  get clientCount(){return new Set(this.state.contracts.filter(contract=>['active','installing'].includes(contract.status)).map(contract=>contract.clientName)).size;}
  get serverPowerKW(){return this.world.entitiesByType('serverRack').reduce((sum,rack)=>sum+(rack.power||0)/1000,0);}
  get facilityPowerKW(){return (this.simulation?.metrics.powerDraw||0)/1000;}
  get pue(){return this.serverPowerKW>0?this.facilityPowerKW/this.serverPowerKW:null;}
  get currentContractRackPowerKW(){
    const liveIds=new Set(this.state.contracts.filter(contract=>['active','installing'].includes(contract.status)).map(contract=>contract.id));
    return this.world.entitiesByType('serverRack').reduce((sum,rack)=>sum+(
      liveIds.has(rack.contractId)?(rack.power||0)/1000:0
    ),0);
  }
  get otherFacilityPowerKW(){return Math.max(0,this.facilityPowerKW-this.currentContractRackPowerKW);}
  get committedPowerKW(){return this.state.contracts.reduce((sum,contract)=>
    ['active','installing'].includes(contract.status)?sum+contract.rackCount*contract.powerPerRackKW:sum,0);}
  get committedFacilityPowerKW(){return this.committedPowerKW+this.otherFacilityPowerKW;}
  get contractedPowerKW(){return this.powerGrid.capacityKW;}
  get powerReserveKW(){return this.contractedPowerKW-this.committedPowerKW;}
  get availableEnergyKW(){return Math.max(0,this.powerReserveKW);}
  get currentRackHeatKW(){return this.world.entitiesByType('serverRack').reduce((sum,rack)=>sum+(
    Number.isFinite(rack.heatGenerationPower)?rack.heatGenerationPower/1000:(rack.heatOutputKW||0)
  ),0);}
  get committedCoolingKW(){return this.committedPowerKW*.98;}
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
  onRackPlaced(rack){this.contracts.attachRack(rack);this.persist();}
  onRackRemoved(rack){
    const contract=this.state.contracts.find(item=>item.id===rack.contractId);if(!contract)return;
    contract.installedRacks=Math.max(0,contract.installedRacks-1);
    if(contract.status==='active')contract.status='installing';
    this.persist();
  }
  acceptOffer(offerId){
    const result=this.contracts.accept(offerId,this.clock.day,this.cash);
    if(!result.ok)return result;
    if(!result.alreadyAccepted)this.assignAvailableRacks(result.contract);
    this.build.budget+=result.installationIncome;
    this.record('Instalação · '+result.contract.clientName,result.installationIncome);
    this.persist();this.build.onChange?.();return result;
  }
  declineOffer(offerId){const declined=this.contracts.decline(offerId);if(declined)this.persist();return declined;}
  cancelContract(contractId){
    const contract=this.state.contracts.find(item=>item.id===contractId);
    if(!this.contracts.cancel(contractId)){return false;}
    this.state.reputation=clampReputation(this.state.reputation-2);
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
    this.racks.update(0,this.clock);
    // Independent racks retain their requested draw while physically disconnected.
    for(const e of powerEquipment(this.world)){
      if(e.type==='serverRack'&&!e.contractId)e.requestedPower=e.powerBlocked?(e.requestedPower??e.power):e.power;
    }
    this.simulation?.cooling?.update(dt,{prepareOnly:true,ignorePowerBlock:true});
  }
  protectPower(dt,billingDt=dt){
    this.preparePowerDemand(dt||this.simulation?.lastPhysicsDt||1/60);
    this.simulation?.batteryDispatch?.dispatch(this.powerGrid.capacityKW*1000,billingDt||dt,{disabled:this.powerGrid.breakerOpen});
    this.powerGrid.update(this.world,dt);
  }
  rearmPower(){
    this.preparePowerDemand(this.simulation?.lastPhysicsDt||1/60);
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
    sampleDailyOperations(this.state.dailyOperations,this.simulation.metrics,this.serverPowerKW,dt);
    if(this.clock.day>this.state.lastSettledDay+1)this.settleDay(this.clock.day);
  }
  settleDay(day){
    if(day-1<=this.state.lastSettledDay)return null;
    const metrics=this.simulation?.metrics||{powerEnergy:0},energyJoules=Math.max(0,(metrics.powerEnergy||0)-this.state.lastPowerEnergy);
    const energyKWh=energyJoules/3600000,energyCost=energyKWh*this.state.energyTariff;
    this.state.lastPowerEnergy=metrics.powerEnergy||0;
    this.racks.evaluateDailyAvailability();
    const violations=new Set(this.state.contracts.filter(contract=>contract.status==='active'&&contract.dailyViolation).map(contract=>contract.id));
    const operatingContracts=[...this.activeContracts];
    const sla={operatingCount:operatingContracts.length,violations:operatingContracts.filter(contract=>violations.has(contract.id)).map(contract=>({id:contract.id,clientName:contract.clientName}))};
    this.contracts.updateDay(day);
    for(const contract of this.state.contracts)if(['completed','cancelled'].includes(contract.status))this.releaseContractRacks(contract.id);
    let revenue=0,penalties=0;
    for(const contract of this.state.contracts){
      if(operatingContracts.includes(contract)){
        const dailyRevenue=contract.monthlyFee/30;revenue+=dailyRevenue;
      }
      if(violations.has(contract.id)){
        contract.lastSlaViolationDay=day;
        penalties+=5000;contract.finesPaid+=5000;this.state.reputation=clampReputation(this.state.reputation-1);
      }else if(operatingContracts.includes(contract))this.state.reputation=clampReputation(this.state.reputation+.015);
      if(contract.status==='completed'&&contract.completedDay===day&&!contract.reputationProcessed){this.state.reputation=clampReputation(this.state.reputation+2);contract.reputationProcessed=true;}
      if(contract.status==='cancelled'&&contract.cancelledDay===day&&!contract.reputationProcessed){this.state.reputation=clampReputation(this.state.reputation-(contract.cancelReason==='Cancelado pelo operador'?2:5));contract.reputationProcessed=true;}
    }
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
    this.contracts.generateExpansionOffer(day,this.state.reputation,violations);
    this.state.dailyResult={day:day-1,revenue,energyCost,fixedPowerCost,coolingMaintenance,penalties,staffPayroll,net,energyKWh,
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
    contract.expiresDay=offer.expiresDay;contract.lastAmendedDay=this.clock.day;contract.amendmentCount=(contract.amendmentCount||0)+1;
    for(const rack of this.world.entitiesByType('serverRack'))if(rack.contractId===contract.id){
      rack.maxPowerKW=contract.powerPerRackKW;rack.baseHeatOutput=contract.powerPerRackKW*980;rack.heatOutput=rack.baseHeatOutput;
    }
    this.build.budget+=offer.installationFee;
    this.record('Aditivo de expansão · '+contract.clientName,offer.installationFee);
    this.persist();this.build.onChange?.();
    return {ok:true,accepted:true,contract,offer};
  }
  markOffersSeen(ids){if(this.contracts.markSeen(ids))this.persist();}
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
    if(this.saveTimer>=10){this.saveTimer=0;this.persist();}
  }
  persist(){
    if(!this.build)return false;
    this.state.cash=this.build.budget;this.state.clockSeconds=this.clock.seconds;this.state.day=this.clock.day;
    this.state.powerCapacityKW=this.powerGrid.capacityKW;
    this.state.powerProtection=this.powerGrid.snapshot();
    this.state.powerEnergyTotal=this.simulation?.metrics.powerEnergy||0;
    return this.saveSystem.save(this.saveSystem.capture(this.world,this.state,this.build));
  }
  clearSave(){return this.saveSystem.clear();}
  load(){
    const snapshot=this.saveSystem.load();if(!snapshot)return false;
    this.snapshot=snapshot;this.saveSystem.restoreWorld(this.world,snapshot);
    this.state={...DEFAULT_STATE(),...snapshot.state};normalizeDailyState(this.state,snapshot.state);this.clock=new GameClock(this.state.clockSeconds);
    if(this.world.technicianSystem)this.world.technicianSystem.payrollDay=this.state.lastSettledDay||0;
    this.powerGrid=new PowerGridSystem({capacityKW:this.state.powerCapacityKW,...this.state.powerProtection});this.contracts=new ContractSystem(this.state,{random:this.random});
    this.racks=new RackSystem(this.world,this.contracts);this.saveSystem.restoreBuild(this.build,snapshot);
    this.world.datacenter=this;this.level.powerLimit=this.powerGrid.capacityKW*1000;
    this.powerGrid.refresh(this.world);
    Object.assign(this.simulation.metrics,{generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:this.state.powerEnergyTotal,energyBalance:0,maxTempEver:25,maxPowerEver:0});
    this.simulation.energySystem.initialize();this.simulation.updateMetrics();this.simulation.mission.lastEventMessage='';
    this.simulation.paused=Boolean(this.state.reportPending);this.simulation.elapsed=this.clock.seconds;
    return true;
  }
  upgradeOptions(){return {minKW:1,maxKW:this.powerGrid.remainingCapacityKW};}
}
