import { COOLING } from './CoolingConstants.js';
import { clamp } from '../../utils/MathUtils.js';
import { VentCoverageCache } from './VentCoverageCache.js';

export class CoolingAirExchange {
  constructor(world,airflow){this.world=world;this.airflow=airflow;this.coverage=new VentCoverageCache(world);}
  serviceRacks(vent,radius=3){
    const {rackCandidates}=this.coverage.get(vent,radius);
    return rackCandidates.map(candidate=>{
      const temperature=this.world.temperatureAtIndex(candidate.inletIndex),excess=Math.max(0,temperature-(candidate.rack.slaTemperature??30));
      return {...candidate,temperature,excess,order:this.world.entityOrder(candidate.rack)};
    }).sort((a,b)=>b.excess-a.excess||a.distance-b.distance||a.order-b.order).slice(0,3);
  }
  coolingDemand(vent){return this.serviceRacks(vent).reduce((sum,item)=>sum+item.excess,0);}
  supplyCells(vent,radius=3,prioritizeRacks=true){
    const geometry=this.coverage.get(vent,radius),racks=prioritizeRacks?this.serviceRacks(vent,radius):[];
    const inlets=new Map(racks.map(item=>[item.inletIndex,item]));
    return geometry.cells.map(cell=>{
      const rack=inlets.get(cell.index),weight=cell.staticWeight*(rack?5*(1+Math.min(20,rack.excess)/10):1);
      return rack?{x:cell.x,y:cell.y,index:cell.index,weight,rack:rack.rack}:{x:cell.x,y:cell.y,index:cell.index,weight};
    });
  }
  returnTemperature(vent){
    const w=this.world,stencil=this.coverage.get(vent).returnAirStencil;let total=0,weighted=0;
    for(const cell of stencil){total+=cell.weight;weighted+=w.temperatureAtIndex(cell.index)*cell.weight;}
    return total?weighted/total:w.environment.temperature;
  }
  transferMassEnergy(vent,dt,maxCooling=Infinity,preview=null){
    if(!vent.flowRate||dt<=0)return 0;
    const cells=this.supplyCells(vent);if(!cells.length)return 0;
    const totalWeight=cells.reduce((sum,cell)=>sum+cell.weight,0)||1,changes=[];
    for(const cell of cells){
      const i=this.world.index(cell.x,cell.y),capacity=this.world.capacityAtIndex(i),mass=this.world.massAt(cell.x,cell.y),currentEnergy=preview?.get(i)??this.world.energy[i],roomT=currentEnergy/capacity;
      const localFlow=vent.flowRate*cell.weight/totalWeight,fraction=clamp((localFlow*COOLING.airDensity*dt)/Math.max(mass,1e-6),0,COOLING.maxExchangeFraction);
      changes.push({i,energyDelta:capacity*fraction*(vent.airTemperature-roomT)});
    }
    const totalCooling=changes.reduce((sum,change)=>sum+Math.min(0,change.energyDelta),0),coolingLimit=Math.max(0,maxCooling*dt),scale=Number.isFinite(coolingLimit)&&-totalCooling>coolingLimit&&totalCooling<0?coolingLimit/-totalCooling:1;
    let totalDelta=0;
    for(const change of changes){
      const energyDelta=change.energyDelta<0?change.energyDelta*scale:change.energyDelta;totalDelta+=energyDelta;
      if(preview)preview.set(change.i,(preview.get(change.i)??this.world.energy[change.i])+energyDelta);
      else this.world.energy[change.i]+=energyDelta;
    }
    return totalDelta/dt;
  }
  applySupply(vent,dt,maxCooling=Infinity){return this.transferMassEnergy(vent,dt,maxCooling);}
  applyMomentum(sources,dt){
    this.airflow?.queueCoolingMomentum?.(sources,dt);
  }
}
