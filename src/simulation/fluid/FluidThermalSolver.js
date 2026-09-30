import { WATER_CP } from '../../utils/Constants.js';
import { FLUID_THERMAL } from './FluidThermalConstants.js';

/** Stable, simultaneous advection and flow-weighted inlet/outlet measurements. */
export class FluidThermalSolver {
  substeps(network,dt){
    if(!network.links?.length||dt<=0)return 1;
    const outgoing=new Map(network.entities.map(entity=>[entity.id,0]));
    for(const link of network.links)outgoing.set(link.from.id,(outgoing.get(link.from.id)||0)+link.flowRate);
    let maximumFlow=0,minimumMass=Infinity;
    for(const entity of network.entities){maximumFlow=Math.max(maximumFlow,outgoing.get(entity.id)||0);minimumMass=Math.min(minimumMass,Math.max(.01,entity.waterMass||0));}
    return Math.max(1,Math.min(256,Math.ceil(maximumFlow*dt/(minimumMass*FLUID_THERMAL.maxThermalCourant))));
  }

  transportNetwork(network,dt){
    if(!network.closed||network.flowRate<=.01||dt<=0)return;
    const {temperatures,energyDelta,incomingFlow,incomingTemperatureFlow,outgoingFlow,outgoingTemperatureFlow,indexById}=network.runtime;
    for(let i=0;i<network.entities.length;i++){const entity=network.entities[i];temperatures[i]=entity.waterTemperature;energyDelta[i]=0;incomingFlow[i]=0;incomingTemperatureFlow[i]=0;outgoingFlow[i]=0;outgoingTemperatureFlow[i]=0;}
    for(const link of network.links){
      const from=indexById.get(link.from.id),to=indexById.get(link.to.id),flow=link.flowRate,sourceTemperature=temperatures[from],energy=flow*dt*WATER_CP*sourceTemperature;
      energyDelta[from]-=energy;energyDelta[to]+=energy;incomingFlow[to]+=flow;incomingTemperatureFlow[to]+=flow*sourceTemperature;outgoingFlow[from]+=flow;outgoingTemperatureFlow[from]+=flow*sourceTemperature;
    }
    for(let i=0;i<network.entities.length;i++){
      const entity=network.entities[i],before=temperatures[i];
      if(incomingFlow[i]>.01)entity.inletTemperature=incomingTemperatureFlow[i]/incomingFlow[i];
      entity.energy=Math.max(0,entity.energy+energyDelta[i]);
      const outlet=outgoingFlow[i]>.01?outgoingTemperatureFlow[i]/outgoingFlow[i]:entity.waterTemperature;
      entity.outletTemperature=Number.isFinite(outlet)?outlet:before;entity.deltaTemperature=entity.outletTemperature-entity.inletTemperature;
    }
  }
}
