import { isPowered } from '../PowerState.js';
import { CoolingNetworkBuilder } from './CoolingNetworkBuilder.js';
import { CoolingDistributionSolver } from './CoolingDistributionSolver.js';
import { CoolingPerformanceSolver } from './CoolingPerformanceSolver.js';
import { CoolingHeatRejection } from './CoolingHeatRejection.js';
import { CoolingDiagnostics } from './CoolingDiagnostics.js';
import { CoolingAirExchange } from './CoolingAirExchange.js';
import { CoolingFramePlan } from './CoolingFramePlan.js';
import { COOLING } from './CoolingConstants.js';

const EMPTY_PATHS=[];

export class CoolingSystem {
  constructor(world,airflow,metrics){
    this.world=world;this.airflow=airflow;this.metrics=metrics;this.builder=new CoolingNetworkBuilder(world);
    this.distribution=new CoolingDistributionSolver();this.performance=new CoolingPerformanceSolver();
    this.exchange=new CoolingAirExchange(world,airflow);this.heatRejection=new CoolingHeatRejection(world,metrics);this.diagnostics=new CoolingDiagnostics();
    this.networks=[];this.units=[];this.momentumSources=[];this.pendingExchange=[];this.pendingExchangePool=new Map();this.networksByUnitId=new Map();this.pathsByUnitId=new Map();this.pathsByNetworkUnitId=new Map();this.pathsByVentId=new Map();this.networkByVentId=new Map();this.ventPlans=new Map();this.ventPlanPool=new Map();this.plannedByUnit=new Map();this.previewRuntime=new Map();this.preparedFrame=null;this.capturePreparedFrame=false;this.lastTopologyVersion=-1;this.lastPowerSignature='';this.distributionTimer=0;this.distributionInterval=.1;this.monitor=null;
    Object.assign(metrics,{coolingInstalledCapacity:0,coolingAvailableCapacity:0,coolingActiveCapacity:0,coolingDelivered:0,coolingPower:0,coolingHeatRejected:0,coolingReserveMargin:0});
  }
  rebuild(ignorePowerBlock=false){
    this.units=this.world.entitiesByType('coolingUnit');
    const usedLabels=new Set(this.units.map(unit=>unit.unitLabel).filter(Boolean));
    let labelSequence=this.world.coolingUnitLabelSequence||0;
    for(const unit of this.units)if(!unit.unitLabel){
      let label;
      do{label='AC-'+String(++labelSequence).padStart(2,'0');}while(usedLabels.has(label));
      unit.unitLabel=label;usedLabels.add(label);
    }
    this.world.coolingUnitLabelSequence=labelSequence;
    this.networks=this.builder.build();this.world.coolingSystem=this;this.momentumSources=[];this.heatRejection.reset();this.pendingExchange.length=0;this.pendingExchangePool.clear();this.ventPlans.clear();this.ventPlanPool.clear();this.plannedByUnit.clear();this.previewRuntime.clear();
    this.ducts=this.networks.flatMap(network=>network.ducts);
    this.networksByUnitId.clear();this.pathsByUnitId.clear();this.pathsByNetworkUnitId.clear();this.pathsByVentId.clear();this.networkByVentId.clear();this.unitNetworkRuntime=new Map();
    for(const unit of this.units)this.unitNetworkRuntime.set(unit.id,{status:'DISCONNECTED',paths:EMPTY_PATHS});
    for(const network of this.networks){
      network.topologyPaths=network.paths.map(path=>({...path,unit:path.unit||network.sourceUnit}));network.paths.length=0;
      for(const unit of network.sourceUnits){
        let connected=this.networksByUnitId.get(unit.id);if(!connected)this.networksByUnitId.set(unit.id,connected=[]);connected.push(network);
        const key=this.networkUnitKey(network,unit);let networkPaths=this.pathsByNetworkUnitId.get(key);if(!networkPaths)this.pathsByNetworkUnitId.set(key,networkPaths=[]);
        for(const path of network.topologyPaths)if(path.unit===unit){path.network=network;networkPaths.push(path);let unitPaths=this.pathsByUnitId.get(unit.id);if(!unitPaths)this.pathsByUnitId.set(unit.id,unitPaths=[]);unitPaths.push(path);}
      }
      for(const vent of network.vents){this.networkByVentId.set(vent.id,network);let ventPaths=this.pathsByVentId.get(vent.id);if(!ventPaths)this.pathsByVentId.set(vent.id,ventPaths=[]);for(const path of network.topologyPaths)if(path.vent===vent)ventPaths.push(path);}
    }
    this.lastTopologyVersion=this.world.utilityTopologyVersion;this.lastPowerSignature=this.powerSignature(ignorePowerBlock);
    this.monitor?.count('coolingRebuildCount');
    this.refreshDistribution(ignorePowerBlock);
    this.updateMetrics();
  }
  set monitor(value){this._monitor=value;if(this.exchange?.coverage)this.exchange.coverage.monitor=value;}
  get monitor(){return this._monitor||null;}
  networkUnitKey(network,unit){return String(network.id)+'|'+String(unit.id);}
  powerSignature(ignorePowerBlock=false){let signature='';for(const unit of this.units)signature+=String(unit.id)+':'+Number(isPowered(unit,ignorePowerBlock))+'|';return signature;}
  rebuildIfNeeded(ignorePowerBlock=false){
    if(this.lastTopologyVersion!==this.world.utilityTopologyVersion){this.rebuild(ignorePowerBlock);return true;}
    const signature=this.powerSignature(ignorePowerBlock);
    if(this.lastPowerSignature!==signature){this.lastPowerSignature=signature;this.refreshDistribution(ignorePowerBlock);return true;}
    return false;
  }
  refreshDistribution(ignorePowerBlock=false,affectedNetworks=null){
    this.monitor?.count('coolingControlUpdates');this.distributionTimer=0;
    const networks=affectedNetworks||this.networks;
    let affectedVents=null,affectedDucts=null;
    if(affectedNetworks){affectedVents=new Set();affectedDucts=new Set();for(const network of networks){for(const vent of network.vents||[])affectedVents.add(vent);for(const duct of network.ducts||[])affectedDucts.add(duct);}}
    if(affectedNetworks)this.momentumSources=this.momentumSources.filter(source=>!affectedVents.has(source.vent));
    else this.momentumSources.length=0;
    const vents=affectedVents||this.world.entitiesByType('supplyVent'),ducts=affectedDucts||this.ducts||[];
    for(const vent of vents){vent.flowRate=0;vent.coolingDelivered=0;vent.networkId=null;vent.networkStatus='DISCONNECTED';}
    for(const duct of ducts){duct.flowRate=0;duct.airTemperature=25;const direction=duct.direction||(duct.direction={x:0,y:0});direction.x=0;direction.y=0;}
    for(const network of networks){network.availableCooling=0;network.availableAirFlow=0;network.paths.length=0;}
    for(const n of networks){
      if(n.status!=='READY')continue;
      for(const unit of n.sourceUnits){
        const paths=this.pathsByNetworkUnitId.get(this.networkUnitKey(n,unit))||EMPTY_PATHS;
        if(!isPowered(unit,ignorePowerBlock)){for(const path of paths)path.flowRate=0;continue;}
        let hasHotRack=false;
        for(const path of paths)if(path.vent.flowMode==='auto'){path.dynamicDemand=this.exchange.coolingDemand(path.vent);if(path.dynamicDemand>0)hasHotRack=true;}
        for(const path of paths)if(path.vent.flowMode==='auto')path.autoWeight=hasHotRack?1+Math.min(20,path.dynamicDemand):1;
        this.distribution.solvePaths(paths,unit.maxAirFlow);
        for(const path of paths){n.paths.push(path);n.availableAirFlow+=path.flowRate;path.vent.flowRate+=path.flowRate;}
      }
      for(const vent of n.vents)if(vent.flowRate>0){vent.airTemperature=this.world.temperatureAt(vent.x,vent.y);this.momentumSources.push({vent,kind:'supply'});}
    }
    const affectedUnits=affectedNetworks?new Set(networks.flatMap(network=>network.sourceUnits||[])):null;
    for(const unit of this.units){
      if(affectedUnits&&!affectedUnits.has(unit))continue;
      const connected=this.networksByUnitId.get(unit.id)||EMPTY_PATHS;let ready=false,status='';
      for(const network of connected){if(network.status==='READY'&&(this.pathsByNetworkUnitId.get(this.networkUnitKey(network,unit))||EMPTY_PATHS).length)ready=true;if(status)status+=' / ';status+=network.status;}
      unit.status=isPowered(unit,ignorePowerBlock)?(ready?'READY':status||'DISCONNECTED'):'OFF';
    }
  }
  update(dt,{prepareOnly=false,ignorePowerBlock=false,unitIds=null,skipDistribution=false,preservePending=false,preview:providedPreview=null}={}){
    if(!prepareOnly&&!this.capturePreparedFrame)this.preparedFrame=null;
    if(!prepareOnly&&!preservePending)this.pendingExchange.length=0;
    if(!skipDistribution){
      if(!this.rebuildIfNeeded(ignorePowerBlock)){
        this.distributionTimer+=Math.max(0,dt);
        if(this.distributionTimer+1e-9>=this.distributionInterval){this.distributionTimer%=this.distributionInterval;this.refreshDistribution(ignorePowerBlock);}
      }
    }
    const preview=providedPreview||this.previewRuntime;if(!providedPreview)preview.clear();
    const ventPlans=this.ventPlans,plannedByUnit=this.plannedByUnit;ventPlans.clear();plannedByUnit.clear();
    for(const plan of this.ventPlanPool.values())plan.contributionCount=0;
    for(const unit of this.units){
      if(unitIds&&!unitIds.has(unit.id))continue;
      const related=this.networksByUnitId.get(unit.id)||EMPTY_PATHS;let network=related[0],relatedIds='';
      let selectedReady=false;for(const candidate of related){if(relatedIds)relatedIds+=',';relatedIds+=candidate.id;if(!selectedReady&&candidate.status==='READY'){network=candidate;selectedReady=true;}}
      if(this.world.landOwnership){
        const grid=this.airflow.grid;grid.syncTopology();const index=grid.cellIndex(unit.x,unit.y);
        unit.indoor=grid.isAir(unit.x,unit.y)&&grid.exteriorCells[index]===0;
      }else unit.indoor=(this.world.zones||[]).some(z=>unit.x>=z.x&&unit.y>=z.y&&unit.x<z.x+z.width&&unit.y<z.y+z.height);
      unit.outdoorTemperature=unit.indoor?this.world.temperatureAt(unit.x,unit.y):this.world.environment.temperature;
      const branches=network?this.pathsByNetworkUnitId.get(this.networkUnitKey(network,unit))||EMPTY_PATHS:EMPTY_PATHS;
      let total=0,weightedTemperature=0;for(const path of branches){const temp=this.exchange.returnTemperature(path.vent);total+=path.flowRate;weightedTemperature+=temp*path.flowRate;}
      const returnT=total?weightedTemperature/total:this.world.environment.temperature,runtimeNetwork=this.unitNetworkRuntime.get(unit.id);
      runtimeNetwork.status=network?.status||(isPowered(unit,ignorePowerBlock)?'DISCONNECTED':'OFF');runtimeNetwork.paths=branches;
      const result=this.performance.solve(unit,runtimeNetwork,returnT,ignorePowerBlock);
      Object.assign(unit,{actualRoomCooling:0,currentAirFlow:result.flow,availableCapacity:result.capacity,currentCooling:0,coolingLoad:result.cooling,returnTemperature:returnT,supplyTemperature:result.supplyTemperature,electricalPower:0,compressorPower:0,condenserFanPower:0,heatRejected:0,rejectedHeat:0,loadRatio:result.loadRatio,power:0,status:result.status,fanSpeed:result.flow?Math.min(1,result.flow/unit.maxAirFlow):0,fanActive:result.flow>0});
      unit.currentAirFlow=result.flow;unit.networkId=relatedIds||null;unit.networkStatus=network?.status||'DISCONNECTED';
      if(network)network.availableCooling+=result.capacity;
      let remaining=result.cooling;
      // Flow already includes the branch efficiency from CoolingDistributionSolver.
      // Weighting by efficiency again would penalize long ducts twice.
      const branchWeights=total;
      for(const path of branches){
        const share=branchWeights?path.flowRate/branchWeights:0,cooling=Math.min(remaining,result.cooling*share);remaining-=cooling;
        const mass=path.flowRate*COOLING.airDensity,supplyT=mass?returnT-cooling/(mass*COOLING.airCp):returnT;
        path.cooling=cooling;path.vent.networkId=network.id;
        let plan=ventPlans.get(path.vent);
        if(!plan){plan=this.ventPlanPool.get(path.vent);if(!plan){plan={vent:path.vent,flow:0,returnHeat:0,cooling:0,contributions:[],contributionCount:0};this.ventPlanPool.set(path.vent,plan);}plan.flow=0;plan.returnHeat=0;plan.cooling=0;plan.contributionCount=0;ventPlans.set(path.vent,plan);}
        plan.flow+=path.flowRate;plan.returnHeat+=path.flowRate*returnT;plan.cooling+=cooling;
        const contributionIndex=plan.contributionCount++,contribution=plan.contributions[contributionIndex]||{unit:null,path:null,cooling:0};
        contribution.unit=unit;contribution.path=path;contribution.cooling=cooling;plan.contributions[contributionIndex]=contribution;
        for(let i=0;i<path.path.length;i++){
          const duct=path.path[i],previousFlow=duct.flowRate;
          duct.flowRate+=path.flowRate;
          if(duct.flowRate>0)duct.airTemperature=(duct.airTemperature*previousFlow+supplyT*path.flowRate)/duct.flowRate;
          const next=path.path[i+1]||path.vent,direction=duct.direction||(duct.direction={x:0,y:0});direction.x=Math.sign(next.x-duct.x);direction.y=Math.sign(next.y-duct.y);
        }
      }
      unit.currentCooling=result.cooling;unit.coolingLoad=result.cooling;
    }
    for(const plan of ventPlans.values()){
      const {vent,flow,cooling,contributions}=plan;contributions.length=plan.contributionCount;
      const returnT=flow?plan.returnHeat/flow:this.world.temperatureAt(vent.x,vent.y);
      vent.airTemperature=flow?returnT-cooling/(flow*COOLING.airDensity*COOLING.airCp):returnT;
      vent.dischargeVelocity=flow/Math.max(.01,vent.area||.08);
      vent.networkStatus='READY';
      const reservedCooling=cooling>0&&this.world.datacenter?Math.max(0,-this.exchange.transferMassEnergy(vent,dt,cooling,preview)):cooling;
      if(cooling>0&&(!prepareOnly||this.capturePreparedFrame)){
        let exchange=this.pendingExchangePool.get(vent);if(!exchange){exchange={vent,contributions,reservedCooling:0};this.pendingExchangePool.set(vent,exchange);}
        exchange.vent=vent;exchange.contributions=contributions;exchange.reservedCooling=reservedCooling;this.pendingExchange.push(exchange);
      }
      for(const contribution of contributions){
        const share=cooling?contribution.cooling/cooling:0;
        plannedByUnit.set(contribution.unit,(plannedByUnit.get(contribution.unit)||0)+reservedCooling*share);
      }
    }
    if(this.world.datacenter)for(const unit of this.units){
      const plannedPower=(plannedByUnit.get(unit)||0)/Math.max(.1,unit.cop)+(unit.currentAirFlow>0?unit.fanPower:0);
      if(ignorePowerBlock)unit.requestedPower=plannedPower;
      unit.power=isPowered(unit)?plannedPower:0;
    }
    if(!prepareOnly&&this.momentumSources.length)this.airflow.queueCoolingMomentum?.(this.momentumSources,dt);
    this.metrics.coolingDelivered=0;this.metrics.coolingPower=0;this.metrics.coolingHeatRejected=0;
    if(prepareOnly&&this.capturePreparedFrame){
      this.preparedFrame=new CoolingFramePlan({dt,topologyVersion:this.world.utilityTopologyVersion,powerSignature:this.powerSignature(ignorePowerBlock),
        units:this.units.map(unit=>this.frameUnitSnapshot(unit)),
        vents:[...ventPlans.values()].map(plan=>({ventId:plan.vent.id,flow:plan.flow,temperature:plan.vent.airTemperature,cooling:plan.cooling,momentum:plan.vent.dischargeVelocity,branches:plan.contributions})),
        pendingExchange:this.pendingExchange.slice(),momentumSources:this.momentumSources.slice()});
    }
  }
  prepareFrame(dt,{ignorePowerBlock=true}={}){
    this.monitor?.begin?.('coolingPrepareMs');this.monitor?.count?.('coolingPrepareCount');
    this.pendingExchange.length=0;this.capturePreparedFrame=true;
    try{this.update(dt,{prepareOnly:true,ignorePowerBlock});}finally{this.capturePreparedFrame=false;this.monitor?.end?.('coolingPrepareMs');}
    return this.preparedFrame;
  }
  applyPowerResult(dt){
    const plan=this.preparedFrame;
    if(!plan||plan.dt!==dt||plan.topologyVersion!==this.world.utilityTopologyVersion){
      this.preparedFrame=null;this.update(dt);return false;
    }
    const powerSignature=this.powerSignature(false);
    if(plan.powerSignature!==powerSignature){
      const original=new Map(plan.powerSignature.split('|').filter(Boolean).map(entry=>{const [id,state]=entry.split(':');return [id,Number(state)];}));
      const changed=new Set(this.units.filter(unit=>original.get(String(unit.id))!==Number(isPowered(unit))).map(unit=>unit.id));
      const affectedNetworks=this.networks.filter(network=>(network.sourceUnits||[]).some(unit=>changed.has(unit.id)));
      if(!affectedNetworks.length){
        const affectedUnits=changed;
        this.pendingExchange=plan.pendingExchange.filter(item=>!item.contributions.some(entry=>affectedUnits.has(entry.unit.id)));
        this.momentumSources=plan.momentumSources.slice();this.lastPowerSignature=powerSignature;
        this.update(dt,{unitIds:affectedUnits,skipDistribution:true,preservePending:true});
        this.preparedFrame=null;this.monitor?.count?.('coolingPartialRecalcCount');return false;
      }
      const affectedUnits=new Set(affectedNetworks.flatMap(network=>(network.sourceUnits||[]).map(unit=>unit.id)));
      const affectedVents=new Set(affectedNetworks.flatMap(network=>network.vents||[]));
      this.pendingExchange=plan.pendingExchange.filter(item=>!item.contributions.some(entry=>affectedUnits.has(entry.unit.id)));
      const preview=new Map();
      for(const item of this.pendingExchange){const cooling=item.contributions.reduce((sum,entry)=>sum+entry.cooling,0);this.exchange.transferMassEnergy(item.vent,dt,cooling,preview);}
      this.momentumSources=plan.momentumSources.filter(source=>!affectedVents.has(source.vent));
      this.refreshDistribution(false,affectedNetworks);this.lastPowerSignature=powerSignature;
      this.update(dt,{unitIds:affectedUnits,skipDistribution:true,preservePending:true,preview});
      this.preparedFrame=null;this.monitor?.count?.('coolingPartialRecalcCount');return false;
    }
    this.pendingExchange=plan.pendingExchange.slice();this.momentumSources=plan.momentumSources.slice();
    if(this.momentumSources.length)this.airflow.queueCoolingMomentum?.(this.momentumSources,dt);
    this.metrics.coolingDelivered=0;this.metrics.coolingPower=0;this.metrics.coolingHeatRejected=0;
    this.preparedFrame=null;this.monitor?.count?.('coolingFrameReuseCount');return true;
  }
  exchangeRooms(dt){
    this.monitor?.begin('coolingExchangeMs');
    for(const item of this.pendingExchange){
      const actual=this.exchange.applySupply(item.vent,dt,item.reservedCooling),removed=Math.max(0,-actual);
      item.vent.coolingDelivered=removed;this.metrics.coolingDelivered+=removed;
      const planned=item.contributions.reduce((sum,entry)=>sum+entry.cooling,0);
      for(const entry of item.contributions){
        const share=planned?entry.cooling/planned:0,delivered=removed*share;
        entry.path.coolingDelivered=delivered;
        entry.unit.actualRoomCooling=(entry.unit.actualRoomCooling||0)+delivered;
      }
    }
    for(const unit of this.units){
      unit.currentCooling=unit.actualRoomCooling||0;unit.coolingLoad=unit.currentCooling;
      unit.compressorPower=unit.currentCooling/Math.max(.1,unit.cop);unit.condenserFanPower=unit.currentAirFlow>0?unit.fanPower:0;
      unit.electricalPower=unit.compressorPower+unit.condenserFanPower;unit.power=unit.electricalPower;
      unit.heatRejected=unit.currentCooling+unit.electricalPower;unit.rejectedHeat=unit.heatRejected;
      const rejected=unit.heatRejected/Math.max(1,dt);this.heatRejection.queue(unit,rejected);
      this.metrics.coolingPower+=unit.electricalPower;
    }
    this.heatRejection.apply(dt);this.pendingExchange.length=0;this.updateMetrics();this.monitor?.end('coolingExchangeMs');
  }
  updateMetrics(){
    const units=this.units;let installed=0,available=0,active=0;
    for(const unit of units){installed+=unit.ratedCoolingCapacity;if(isPowered(unit))available+=unit.availableCapacity||0;active+=unit.currentCooling||0;}
    this.metrics.coolingInstalledCapacity=installed;
    this.metrics.coolingAvailableCapacity=available;
    this.metrics.coolingActiveCapacity=active;
    const margin=this.metrics.coolingAvailableCapacity?1-this.metrics.coolingActiveCapacity/this.metrics.coolingAvailableCapacity:0;
    this.metrics.coolingReserveMargin=margin;this.metrics.coolingDiagnostics=this.diagnostics.update(this.networks,units);
  }
  frameUnitSnapshot(unit){
    const branches=[];
    for(const path of this.pathsByUnitId.get(unit.id)||EMPTY_PATHS)if(path.network.status==='READY'&&isPowered(unit,true))branches.push({ventId:path.vent.id,flow:path.flowRate,cooling:path.cooling||0,efficiency:path.efficiency||1});
    return {unitId:unit.id,requestedCooling:unit.coolingLoad||0,requestedPower:unit.requestedPower||0,airflow:unit.currentAirFlow||0,capacity:unit.availableCapacity||0,branches};
  }
}
