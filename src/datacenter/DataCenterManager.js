import { GameClock } from './GameClock.js';
import { ContractSystem } from './ContractSystem.js';
import { RackSystem } from './RackSystem.js';
import { DataCenterSaveSystem } from './DataCenterSaveSystem.js';
import { PowerGridSystem, POWER_TIERS } from './PowerGridSystem.js';
import { ServerRack } from '../entities/ServerRack.js';

const DEFAULT_STATE=()=>({cash:150000,clockSeconds:0,day:1,reputation:50,powerCapacityKW:100,energyTariff:0.85,
  offerSequence:0,offers:[],marketInitialized:false,contracts:[],ledger:[],dailyViolation:false,lastPowerEnergy:0,rackSequence:0});
const clampReputation=value=>Math.max(0,Math.min(100,value));

export class DataCenterManager {
  constructor(world,level,{saveSystem=new DataCenterSaveSystem()}={}){
    this.world=world;this.level=level;this.saveSystem=saveSystem;this.snapshot=saveSystem.load();
    const defaults=DEFAULT_STATE();defaults.cash=level.datacenter.initialCash??defaults.cash;defaults.powerCapacityKW=level.datacenter.powerCapacityKW??defaults.powerCapacityKW;defaults.energyTariff=level.datacenter.energyTariff??defaults.energyTariff;defaults.coolingMaintenanceDaily=level.datacenter.coolingMaintenanceDaily??110;
    this.state={...defaults,...(this.snapshot?.state||{})};
    this.clock=new GameClock(this.state.clockSeconds);
    this.powerGrid=new PowerGridSystem({capacityKW:this.state.powerCapacityKW});
    this.contracts=new ContractSystem(this.state);
    this.racks=new RackSystem(world,this.contracts);
    this.build=null;this.simulation=null;this.saveTimer=0;
    world.datacenter=this;world.datacenterConfig=level.datacenter;
    if(this.snapshot)saveSystem.restoreWorld(world,this.snapshot);
  }
  attach(build,simulation){
    this.build=build;this.simulation=simulation;
    build.budget=this.state.cash;
    if(this.snapshot)this.saveSystem.restoreBuild(build,this.snapshot);
    this.level.powerLimit=this.powerGrid.capacityKW*1000;
    this.world.datacenterConfig.rackSpace=this.level.datacenter.rackSpace;
    this.persist();
  }
  get cash(){return this.build?.budget??this.state.cash;}
  get nextPowerTier(){return this.powerGrid.nextTier;}
  get rackCount(){return this.world.entitiesByType('serverRack').length;}
  get activeContracts(){return this.state.contracts.filter(contract=>contract.status==='active');}
  get clientCount(){return new Set(this.state.contracts.filter(contract=>['active','installing'].includes(contract.status)).map(contract=>contract.clientName)).size;}
  get serverPowerKW(){return this.world.entitiesByType('serverRack').reduce((sum,rack)=>sum+(rack.power||0)/1000,0);}
  get facilityPowerKW(){return (this.simulation?.metrics.powerDraw||0)/1000;}
  get pue(){return this.serverPowerKW>0?this.facilityPowerKW/this.serverPowerKW:null;}
  get availableEnergyKW(){return Math.max(0,this.powerGrid.capacityKW-this.facilityPowerKW);}
  get installedCoolingKW(){return (this.simulation?.metrics.coolingAvailableCapacity||0)/1000;}
  get rackCoolingDemandKW(){return this.world.entitiesByType('serverRack').reduce((sum,rack)=>sum+rack.maxPowerKW,0);}
  get availableCoolingKW(){return Math.max(0,this.installedCoolingKW-this.rackCoolingDemandKW);}
  get rackSpaceAvailable(){return Math.max(0,(this.level.datacenter.rackSpace||0)-this.rackCount);}
  get capacityForNewContractsKW(){return Math.min(this.availableEnergyKW,this.availableCoolingKW);}
  get bottleneckResource(){
    const cooling=this.availableCoolingKW,energy=this.availableEnergyKW,space=this.rackSpaceAvailable;
    const ratios=[{name:'energia',headroom:this.powerGrid.capacityKW?energy/this.powerGrid.capacityKW:0},{name:'refrigeração',headroom:this.installedCoolingKW?cooling/this.installedCoolingKW:0},{name:'espaço',headroom:(this.level.datacenter.rackSpace||0)?space/this.level.datacenter.rackSpace:0}];
    return ratios.sort((a,b)=>a.headroom-b.headroom)[0].name;
  }

  nextRackPlacement(){
    const contract=this.contracts.nextInstallation();if(!contract)return null;
    const rackNumber=contract.installedRacks+1;
    return {clientId:contract.clientName,contractId:contract.id,maxPowerKW:contract.powerPerRackKW,
      currentPowerKW:0,heatOutputKW:0,inletTemperature:25,exhaustTemperature:25,cpuLoad:0,uptime:100,status:'INSTALLING',
      slaTemperature:contract.maxInletTemperature,loadProfile:contract.loadProfile,clientName:contract.clientName,rackNumber};
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
    for(const rack of this.world.entitiesByType('serverRack'))if(rack.contractId===contractId){rack.enabled=false;rack.status='CANCELLED';}
    this.record('Cancelamento · '+contract.clientName,0);this.persist();return true;
  }
  upgradePower(capacityKW){
    const result=this.powerGrid.upgrade(Number(capacityKW),this.cash);
    if(!result.ok)return result;
    this.build.budget-=result.cost;this.state.powerCapacityKW=result.tier.capacityKW;
    this.level.powerLimit=result.tier.capacityKW*1000;this.record('Instalação de rede · '+result.tier.capacityKW+' kW',-result.cost);
    this.persist();return result;
  }
  update(dt){
    const oldDay=this.clock.day;this.clock.advance(dt);this.state.clockSeconds=this.clock.seconds;
    this.racks.update(dt,this.clock);
    for(let day=oldDay+1;day<=this.clock.day;day++)this.settleDay(day);
  }
  afterThermalStep(dt){
    this.racks.afterThermalStep(dt);
    if(this.simulation)this.racks.evaluateContracts(this.simulation.metrics);
  }
  settleDay(day){
    const metrics=this.simulation?.metrics||{powerEnergy:0},energyJoules=Math.max(0,(metrics.powerEnergy||0)-this.state.lastPowerEnergy);
    const energyKWh=energyJoules/3600000,energyCost=energyKWh*this.state.energyTariff;
    this.state.lastPowerEnergy=metrics.powerEnergy||0;
    this.racks.evaluateDailyAvailability();
    const violations=new Set(this.state.contracts.filter(contract=>contract.status==='active'&&contract.dailyViolation).map(contract=>contract.id));
    this.contracts.updateDay(day);
    let revenue=0,penalties=0;
    for(const contract of this.state.contracts){
      if(contract.status==='active'){
        const dailyRevenue=contract.monthlyFee/30;revenue+=dailyRevenue;
        this.record('Receita · '+contract.clientName,dailyRevenue);
      }
      if(violations.has(contract.id)){
        contract.lastSlaViolationDay=day;
        penalties+=5000;contract.finesPaid+=5000;this.state.reputation=clampReputation(this.state.reputation-1);
      }else if(contract.status==='active')this.state.reputation=clampReputation(this.state.reputation+.015);
      if(contract.status==='completed'&&contract.completedDay===day&&!contract.reputationProcessed){this.state.reputation=clampReputation(this.state.reputation+2);contract.reputationProcessed=true;}
      if(contract.status==='cancelled'&&contract.cancelledDay===day&&!contract.reputationProcessed){this.state.reputation=clampReputation(this.state.reputation-(contract.cancelReason==='Cancelado pelo operador'?2:5));contract.reputationProcessed=true;}
    }
    const fixedPowerCost=this.powerGrid.tier.monthlyFixedCost/30,coolingMaintenance=this.state.coolingMaintenanceDaily??110;
    const expenses=energyCost+fixedPowerCost+coolingMaintenance+penalties,net=revenue-expenses;
    this.build.budget+=net;
    this.state.day=day;this.state.clockSeconds=this.clock.seconds;
    this.record('Dia '+(day-1)+' · receitas',revenue);
    this.record('Energia · '+energyKWh.toFixed(1)+' kWh',-energyCost);
    this.record('Contrato elétrico e climatização',-(fixedPowerCost+coolingMaintenance));
    if(penalties)this.record('Multas de SLA',-penalties);
    this.state.dailyResult={day:day-1,revenue,energyCost,fixedPowerCost,coolingMaintenance,penalties,net,energyKWh};
    this.persist();
  }
  record(description,amount){
    this.state.ledger.unshift({day:this.clock.day,description,amount});
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
    return this.saveSystem.save(this.saveSystem.capture(this.world,this.state,this.build));
  }
  clearSave(){return this.saveSystem.clear();}
  load(){
    const snapshot=this.saveSystem.load();if(!snapshot)return false;
    this.snapshot=snapshot;this.saveSystem.restoreWorld(this.world,snapshot);
    this.state={...DEFAULT_STATE(),...snapshot.state};this.clock=new GameClock(this.state.clockSeconds);
    this.powerGrid=new PowerGridSystem({capacityKW:this.state.powerCapacityKW});this.contracts=new ContractSystem(this.state);
    this.racks=new RackSystem(this.world,this.contracts);this.saveSystem.restoreBuild(this.build,snapshot);
    this.world.datacenter=this;this.level.powerLimit=this.powerGrid.capacityKW*1000;
    Object.assign(this.simulation.metrics,{generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0,maxTempEver:25,maxPowerEver:0});
    this.simulation.energySystem.initialize();this.simulation.updateMetrics();this.state.lastPowerEnergy=this.simulation.metrics.powerEnergy;this.simulation.mission.lastEventMessage='';
    return true;
  }
  upgradeOptions(){return POWER_TIERS.filter(tier=>tier.capacityKW>this.powerGrid.capacityKW);}
}
