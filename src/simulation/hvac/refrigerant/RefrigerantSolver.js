import { clamp } from '../../../utils/MathUtils.js';

export class RefrigerantSolver {
  solve({handler,condenser,circuit,coolingDemand=0,evaporatorCapacity=Infinity}){
    if(!handler||!condenser||!circuit||circuit.status!=='READY')return {cooling:0,compressorPower:0,condenserFanPower:0,heatRejected:0,cop:1,capacity:0,capacityFactor:circuit?.capacityFactor||0,status:circuit?.status||'NO REFRIGERANT LINE'};
    const outdoorRise=Math.max(0,condenser.outdoorTemperature-25);
    const cop=clamp(condenser.cop-outdoorRise*.06,1.2,condenser.cop);
    const outdoorFactor=clamp(1-outdoorRise*.015,.45,1);
    const rejectedHeatCapacity=condenser.coolingCapacity*outdoorFactor;
    const fanPower=condenser.enabled?condenser.fanPower:0;
    const condenserCoolingLimit=Math.max(0,(rejectedHeatCapacity-fanPower)/(1+1/cop));
    const lineCapacity=40000*circuit.capacityFactor;
    const capacity=Math.max(0,Math.min(handler.coolingCapacity,evaporatorCapacity,condenserCoolingLimit,lineCapacity));
    const cooling=handler.enabled&&condenser.enabled?Math.max(0,Math.min(coolingDemand,capacity)):0;
    const compressorPower=cooling/cop,condenserFanPower=cooling>0?fanPower:0;
    const heatRejected=cooling+compressorPower+condenserFanPower;
    return {cooling,compressorPower,condenserFanPower,heatRejected,cop,capacity,capacityFactor:circuit.capacityFactor,
      outdoorFactor,rejectedHeatCapacity,status:cooling+1<coolingDemand?'OVERLOAD':'READY'};
  }
}
