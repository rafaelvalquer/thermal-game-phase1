import { Pipe } from './Pipe.js';
import { FLUID_THERMAL } from '../simulation/fluid/FluidThermalConstants.js';

export class Pump extends Pipe {
  constructor(x,y,direction={x:1,y:0}){
    super(x,y,{mass:8});
    this.type='pump';
    this.power=800;
    this.hydraulicPower=36;
    this.flowMode='normal';
    this.maxFlowRate=FLUID_THERMAL.pumpFlowNormal;
    this.maxFlowRateBoost=FLUID_THERMAL.pumpFlowBoost;
    this.resistance=2;
    this.wasteHeatFraction=.2;
    this.direction={x:direction.x??1,y:direction.y??0};
  }
}
