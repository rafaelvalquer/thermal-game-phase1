import { Pipe } from './Pipe.js';

export class WaterChiller extends Pipe {
  constructor(x,y){
    super(x,y,{mass:10});
    this.type='waterChiller';this.resistance=6;this.ratedCapacity=80000;this.targetTemperature=15;this.cop=4;
    this.maxElectricPower=this.ratedCapacity/this.cop;this.power=0;this.requestedPower=this.maxElectricPower;this.wasteHeatFraction=1;
    this.coolingPower=0;this.rejectedHeatPower=0;
  }
}
