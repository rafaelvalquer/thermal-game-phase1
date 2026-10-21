import { isPowered } from '../PowerState.js';
import { clamp } from '../../utils/MathUtils.js';
import { COOLING } from './CoolingConstants.js';

export class CoolingPerformanceSolver {
  outdoorFactor(temperature){
    const points=COOLING.outdoorCapacityPoints;
    if(temperature<=points[0][0])return 1;
    for(let i=1;i<points.length;i++){
      const [rightTemp,rightFactor]=points[i],[leftTemp,leftFactor]=points[i-1];
      if(temperature<=rightTemp){const fraction=(temperature-leftTemp)/(rightTemp-leftTemp);return leftFactor+(rightFactor-leftFactor)*fraction;}
    }
    return Math.max(COOLING.minimumOutdoorCapacityFactor,points.at(-1)[1]-(temperature-points.at(-1)[0])*.01);
  }
  // serviceLimit: temperature the unit must hold for the zones it serves. A unit at full
  // capacity is only OVERLOAD when the air it returns is above that limit; below it the
  // unit is just working hard (HIGH LOAD). The default keeps the capacity-only rule.
  solve(unit,network,returnTemperature,ignorePowerBlock=false,serviceLimit=-Infinity){
    const outdoorFactor=clamp(this.outdoorFactor(unit.outdoorTemperature),COOLING.minimumOutdoorCapacityFactor,1);
    const capacity=isPowered(unit,ignorePowerBlock)&&network.status==='READY'?unit.ratedCoolingCapacity*outdoorFactor:0;
    const flow=isPowered(unit,ignorePowerBlock)&&network.status==='READY'?network.paths.reduce((s,p)=>s+p.flowRate,0):0;
    const demand=flow*COOLING.airDensity*COOLING.airCp*Math.max(0,returnTemperature-unit.targetSupplyTemperature);
    const cooling=Math.min(capacity,demand);
    const loadRatio=capacity?demand/capacity:0;
    const status=!isPowered(unit,ignorePowerBlock)?'OFF':!flow?network.status:loadRatio>=1&&returnTemperature>serviceLimit?'OVERLOAD':loadRatio>=1?'HIGH LOAD':loadRatio>=.85?'HIGH LOAD':cooling>0?'PARTIAL LOAD':'READY';
    return {capacity,flow,demand,cooling,outdoorFactor,status,loadRatio,returnTemperature,supplyTemperature:flow?returnTemperature-cooling/(flow*COOLING.airDensity*COOLING.airCp):returnTemperature};
  }
}
