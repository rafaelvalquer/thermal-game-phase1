import { isPowered } from '../PowerState.js';
import { CoolingNetworkBuilder } from './CoolingNetworkBuilder.js';
import { CoolingDistributionSolver } from './CoolingDistributionSolver.js';
import { CoolingPerformanceSolver } from './CoolingPerformanceSolver.js';
import { CoolingHeatRejection } from './CoolingHeatRejection.js';
import { CoolingDiagnostics } from './CoolingDiagnostics.js';
import { CoolingAirExchange } from './CoolingAirExchange.js';
import { CoolingFramePlan } from './CoolingFramePlan.js';
import { COOLING } from './CoolingConstants.js';

export class CoolingSystem {
  constructor(world,airflow,metrics){
    this.world=world;this.airflow=airflow;this.metrics=metrics;this.builder=new CoolingNetworkBuilder(world);
    this.distribution=new CoolingDistributionSolver();this.performance=new CoolingPerformanceSolver();
    this.exchange=new CoolingAirExchange(world,airflow);this.heatRejection=new CoolingHeatRejection(world,metrics);this.diagnostics=new CoolingDiagnostics();
    this.networks=[];this.units=[];this.momentumSources=[];this.pendingExchange=[];this.preparedFrame=null;this.capturePreparedFrame=false;this.lastTopologyVersion=-1;this.lastPowerSignature='';this.monitor=null;
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
    this.networks=this.builder.build();this.world.coolingSystem=this;this.momentumSources=[];this.heatRejection.reset();this.pendingExchange=[];
    this.ducts=this.networks.flatMap(network=>network.ducts);
    for(const network of this.networks)network.topologyPaths=network.paths.map(path=>({...path,unit:path.unit||network.sourceUnit}));
    this.lastTopologyVersion=this.world.utilityTopologyVersion;this.lastPowerSignature=this.powerSignature(ignorePowerBlock);
    this.monitor?.count('coolingRebuildCount');
    this.refreshDistribution(ignorePowerBlock);
    this.updateMetrics();
  }
  set monitor(value){this._monitor=value;if(this.exchange?.coverage)this.exchange.coverage.monitor=value;}
  get monitor(){return this._monitor||null;}
  powerSignature(ignorePowerBlock=false){return this.world.entitiesByType('coolingUnit').map(unit=>String(unit.id)+':'+Number(isPowered(unit,ignorePowerBlock))).join('|');}
  rebuildIfNeeded(ignorePowerBlock=false){
    if(this.lastTopologyVersion!==this.world.utilityTopologyVersion){this.rebuild(ignorePowerBlock);return true;}
    const signature=this.powerSignature(ignorePowerBlock);
    if(this.lastPowerSignature!==signature){this.lastPowerSignature=signature;this.refreshDistribution(ignorePowerBlock);return true;}
    return false;
  }
  refreshDistribution(ignorePowerBlock=false,affectedNetworks=null){
    const networks=affectedNetworks||this.networks,affected=new Set(networks);
    const affectedVents=new Set(networks.flatMap(network=>network.vents||[]));
    const affectedDucts=new Set(networks.flatMap(network=>network.ducts||[]));
    if(affectedNetworks)this.momentumSources=this.momentumSources.filter(source=>!affectedVents.has(source.vent));
    else this.momentumSources=[];
    const vents=affectedNetworks?affectedVents:this.world.entitiesByType('supplyVent'),ducts=affectedNetworks?affectedDucts:(this.ducts||[]);
    for(const vent of vents){vent.flowRate=0;vent.coolingDelivered=0;vent.networkId=null;vent.networkStatus='DISCONNECTED';}
    for(const duct of ducts){duct.flowRate=0;duct.airTemperature=25;duct.direction={x:0,y:0};}
    for(const network of networks)network.availableCooling=0;
    for(const n of networks){
      if(n.status!=='READY'){n.paths=[];continue;}
      n.paths=n.sourceUnits.flatMap(unit=>{
        if(!isPowered(unit,ignorePowerBlock))return [];
        const paths=(n.topologyPaths||[]).filter(path=>path.unit===unit),automatic=paths.filter(path=>path.vent.flowMode==='auto');
        const demands=automatic.map(path=>this.exchange.coolingDemand(path.vent)),hasHotRack=demands.some(value=>value>0);
        automatic.forEach((path,index)=>{path.autoWeight=hasHotRack?1+Math.min(20,demands[index]):1;});
        return this.distribution.solve({...n,paths},unit.maxAirFlow);
      });
      n.availableAirFlow=n.paths.reduce((s,p)=>s+p.flowRate,0);
      for(const path of n.paths)path.vent.flowRate+=path.flowRate;
      for(const vent of n.vents)if(vent.flowRate>0){vent.airTemperature=this.world.temperatureAt(vent.x,vent.y);this.momentumSources.push({vent,kind:'supply'});}
    }
    const affectedUnits=affectedNetworks?new Set(networks.flatMap(network=>network.sourceUnits||[])):null;
    for(const unit of this.units){
      if(affectedUnits&&!affectedUnits.has(unit))continue;
      const connected=this.networks.filter(network=>network.sourceUnits.includes(unit));
      const ready=connected.some(network=>network.status==='READY'&&network.paths.some(path=>path.unit===unit));
      unit.status=isPowered(unit,ignorePowerBlock)?(ready?'READY':connected.map(network=>network.status).join(' / ')||'DISCONNECTED'):'OFF';
    }
  }
  update(dt,{prepareOnly=false,ignorePowerBlock=false,unitIds=null,skipDistribution=false,preservePending=false,preview:providedPreview=null}={}){
    if(!prepareOnly&&!this.capturePreparedFrame)this.preparedFrame=null;
    if(!prepareOnly&&!preservePending)this.pendingExchange=[];
    if(!skipDistribution&&!this.rebuildIfNeeded(ignorePowerBlock))this.refreshDistribution(ignorePowerBlock);
    const preview=providedPreview||new Map();
    const ventPlans=new Map(),plannedByUnit=new Map();
    const units=unitIds?this.units.filter(unit=>unitIds.has(unit.id)):this.units;
    for(const unit of units){
      const related=this.networks.filter(n=>n.sourceUnit===unit||n.sourceUnits.includes(unit)),network=related.find(n=>n.status==='READY')||related[0];
      unit.indoor=(this.world.zones||[]).some(z=>unit.x>=z.x&&unit.y>=z.y&&unit.x<z.x+z.width&&unit.y<z.y+z.height);
      unit.outdoorTemperature=unit.indoor?this.world.temperatureAt(unit.x,unit.y):this.world.environment.temperature;
      const branches=(network?.paths||[]).filter(path=>(path.unit||network.sourceUnit)===unit),weighted=branches.map(path=>({path,temp:this.exchange.returnTemperature(path.vent)}));
      const total=weighted.reduce((s,p)=>s+p.path.flowRate,0),returnT=total?weighted.reduce((s,p)=>s+p.temp*p.path.flowRate,0)/total:this.world.environment.temperature;
      const result=this.performance.solve(unit,network?{status:network.status,paths:branches}:{status:isPowered(unit)?'DISCONNECTED':'OFF',paths:[]},returnT,ignorePowerBlock);
      Object.assign(unit,{actualRoomCooling:0,currentAirFlow:result.flow,availableCapacity:result.capacity,currentCooling:0,coolingLoad:result.cooling,returnTemperature:returnT,supplyTemperature:result.supplyTemperature,electricalPower:0,compressorPower:0,condenserFanPower:0,heatRejected:0,rejectedHeat:0,loadRatio:result.loadRatio,power:0,status:result.status,fanSpeed:result.flow?Math.min(1,result.flow/unit.maxAirFlow):0,fanActive:result.flow>0});
      unit.currentAirFlow=result.flow;unit.networkId=related.map(n=>n.id).join(',')||null;unit.networkStatus=network?.status||'DISCONNECTED';
      if(network)network.availableCooling+=result.capacity;
      let remaining=result.cooling;
      // Flow already includes the branch efficiency from CoolingDistributionSolver.
      // Weighting by efficiency again would penalize long ducts twice.
      const branchWeights=branches.reduce((s,p)=>s+p.flowRate,0);
      for(const path of branches){
        const share=branchWeights?path.flowRate/branchWeights:0,cooling=Math.min(remaining,result.cooling*share);remaining-=cooling;
        const mass=path.flowRate*COOLING.airDensity,supplyT=mass?returnT-cooling/(mass*COOLING.airCp):returnT;
        path.cooling=cooling;path.vent.networkId=network.id;
        let plan=ventPlans.get(path.vent);
        if(!plan){plan={vent:path.vent,flow:0,returnHeat:0,cooling:0,contributions:[]};ventPlans.set(path.vent,plan);}
        plan.flow+=path.flowRate;plan.returnHeat+=path.flowRate*returnT;plan.cooling+=cooling;
        plan.contributions.push({unit,path,cooling});
        for(let i=0;i<path.path.length;i++){
          const duct=path.path[i],previousFlow=duct.flowRate;
          duct.flowRate+=path.flowRate;
          if(duct.flowRate>0)duct.airTemperature=(duct.airTemperature*previousFlow+supplyT*path.flowRate)/duct.flowRate;
          const next=path.path[i+1]||path.vent;duct.direction={x:Math.sign(next.x-duct.x),y:Math.sign(next.y-duct.y)};
        }
      }
      unit.currentCooling=result.cooling;unit.coolingLoad=result.cooling;
    }
    for(const plan of ventPlans.values()){
      const {vent,flow,cooling,contributions}=plan;
      const returnT=flow?plan.returnHeat/flow:this.world.temperatureAt(vent.x,vent.y);
      vent.airTemperature=flow?returnT-cooling/(flow*COOLING.airDensity*COOLING.airCp):returnT;
      vent.dischargeVelocity=flow/Math.max(.01,vent.area||.08);
      vent.networkStatus='READY';
      const reservedCooling=cooling>0&&this.world.datacenter?Math.max(0,-this.exchange.transferMassEnergy(vent,dt,cooling,preview)):cooling;
      if(cooling>0&&(!prepareOnly||this.capturePreparedFrame))this.pendingExchange.push({vent,contributions,reservedCooling});
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
        units:this.units.map(unit=>({unitId:unit.id,requestedCooling:unit.coolingLoad||0,requestedPower:unit.requestedPower||0,airflow:unit.currentAirFlow||0,capacity:unit.availableCapacity||0,
          branches:this.networks.flatMap(network=>network.paths.filter(path=>(path.unit||network.sourceUnit)===unit).map(path=>({ventId:path.vent.id,flow:path.flowRate,cooling:path.cooling||0,efficiency:path.efficiency||1}))) })),
        vents:[...ventPlans.values()].map(plan=>({ventId:plan.vent.id,flow:plan.flow,temperature:plan.vent.airTemperature,cooling:plan.cooling,momentum:plan.vent.dischargeVelocity,branches:plan.contributions})),
        pendingExchange:this.pendingExchange.slice(),momentumSources:this.momentumSources.slice()});
    }
  }
  prepareFrame(dt,{ignorePowerBlock=true}={}){
    this.monitor?.begin?.('coolingPrepareMs');this.monitor?.count?.('coolingPrepareCount');
    this.pendingExchange=[];this.capturePreparedFrame=true;
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
    this.heatRejection.apply(dt);this.pendingExchange=[];this.updateMetrics();this.monitor?.end('coolingExchangeMs');
  }
  updateMetrics(){
    const units=this.world.entitiesByType('coolingUnit');
    this.metrics.coolingInstalledCapacity=units.reduce((s,u)=>s+u.ratedCoolingCapacity,0);
    this.metrics.coolingAvailableCapacity=units.filter(u=>isPowered(u)).reduce((s,u)=>s+(u.availableCapacity||0),0);
    this.metrics.coolingActiveCapacity=units.reduce((s,u)=>s+(u.currentCooling||0),0);
    const margin=this.metrics.coolingAvailableCapacity?1-this.metrics.coolingActiveCapacity/this.metrics.coolingAvailableCapacity:0;
    this.metrics.coolingReserveMargin=margin;this.metrics.coolingDiagnostics=this.diagnostics.update(this.networks,units);
  }
}
