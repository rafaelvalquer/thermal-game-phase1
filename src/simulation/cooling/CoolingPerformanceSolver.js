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
  solve(unit,network,returnTemperature){
    const outdoorFactor=clamp(this.outdoorFactor(unit.outdoorTemperature),COOLING.minimumOutdoorCapacityFactor,1);
    const capacity=unit.enabled&&network.status==='READY'?unit.ratedCoolingCapacity*outdoorFactor:0;
    const flow=unit.enabled&&network.status==='READY'?network.paths.reduce((s,p)=>s+p.flowRate,0):0;
    const demand=flow*COOLING.airDensity*COOLING.airCp*Math.max(0,returnTemperature-unit.targetSupplyTemperature);
    const cooling=Math.min(capacity,demand);
    const loadRatio=capacity?demand/capacity:0;
    const status=!unit.enabled?'OFF':!flow?network.status:loadRatio>=1?'OVERLOAD':loadRatio>=.85?'HIGH LOAD':cooling>0?'PARTIAL LOAD':'READY';
    return {capacity,flow,demand,cooling,outdoorFactor,status,loadRatio,returnTemperature,supplyTemperature:flow?returnTemperature-cooling/(flow*COOLING.airDensity*COOLING.airCp):returnTemperature};
  }
}
