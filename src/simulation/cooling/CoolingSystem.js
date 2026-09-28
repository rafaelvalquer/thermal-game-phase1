import { isPowered } from '../PowerState.js';
import { CoolingNetworkBuilder } from './CoolingNetworkBuilder.js';
import { CoolingDistributionSolver } from './CoolingDistributionSolver.js';
import { CoolingPerformanceSolver } from './CoolingPerformanceSolver.js';
import { CoolingHeatRejection } from './CoolingHeatRejection.js';
import { CoolingDiagnostics } from './CoolingDiagnostics.js';
import { CoolingAirExchange } from './CoolingAirExchange.js';
import { COOLING } from './CoolingConstants.js';

export class CoolingSystem {
  constructor(world,airflow,metrics){
    this.world=world;this.airflow=airflow;this.metrics=metrics;this.builder=new CoolingNetworkBuilder(world);
    this.distribution=new CoolingDistributionSolver();this.performance=new CoolingPerformanceSolver();
    this.exchange=new CoolingAirExchange(world,airflow);this.heatRejection=new CoolingHeatRejection(world,metrics);this.diagnostics=new CoolingDiagnostics();
    this.networks=[];this.units=[];this.momentumSources=[];this.pendingExchange=[];
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
    for(const vent of this.world.entitiesByType('supplyVent')){vent.flowRate=0;vent.coolingDelivered=0;vent.networkId=null;vent.networkStatus='DISCONNECTED';}
    this.networks=this.builder.build();this.world.coolingSystem=this;this.momentumSources=[];this.heatRejection.reset();this.pendingExchange=[];
    for(const n of this.networks){
      if(n.status!=='READY')continue;
      n.paths=n.sourceUnits.flatMap(unit=>{
        if(!isPowered(unit,ignorePowerBlock))return [];
        const paths=n.paths.filter(path=>(path.unit||n.sourceUnit)===unit),automatic=paths.filter(path=>path.vent.flowMode==='auto');
        const demands=automatic.map(path=>this.exchange.coolingDemand(path.vent)),hasHotRack=demands.some(value=>value>0);
        automatic.forEach((path,index)=>{path.autoWeight=hasHotRack?1+Math.min(20,demands[index]):1;});
        return this.distribution.solve({...n,paths},unit.maxAirFlow);
      });
      n.availableAirFlow=n.paths.reduce((s,p)=>s+p.flowRate,0);
      for(const path of n.paths)path.vent.flowRate+=path.flowRate;
      for(const vent of n.vents)if(vent.flowRate>0){vent.airTemperature=this.world.temperatureAt(vent.x,vent.y);this.momentumSources.push({vent,kind:'supply'});}
    }
    this.updateMetrics();
  }
  update(dt,{prepareOnly=false,ignorePowerBlock=false}={}){
    this.rebuild(ignorePowerBlock);
    const preview=new Map();
    const ventPlans=new Map(),plannedByUnit=new Map();
    for(const unit of this.units){
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
      if(cooling>0)this.pendingExchange.push({vent,contributions,reservedCooling});
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
    if(!prepareOnly&&this.momentumSources.length)this.exchange.applyMomentum(this.momentumSources,dt);
    this.metrics.coolingDelivered=0;this.metrics.coolingPower=0;this.metrics.coolingHeatRejected=0;
  }
  exchangeRooms(dt){
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
    this.heatRejection.apply(dt);this.pendingExchange=[];this.updateMetrics();
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
