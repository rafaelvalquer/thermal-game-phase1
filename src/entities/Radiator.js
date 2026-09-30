import { Pipe } from './Pipe.js';
import { FLUID_THERMAL } from '../simulation/fluid/FluidThermalConstants.js';

export class Radiator extends Pipe {
  static PERFORMANCE_REVISION=1;
  static WATER_UA=FLUID_THERMAL.radiatorUA;
  static RATED_CAPACITY=FLUID_THERMAL.radiatorRatedCapacity;
  static MINIMUM_APPROACH=FLUID_THERMAL.radiatorMinimumApproach;
  static FAN_POWER=FLUID_THERMAL.radiatorFanPower;
  constructor(x,y,{direction={x:1,y:0},outdoor=false}={}){
    super(x,y,{mass:12});
    this.type='radiator';
    this.resistance=5;
    this.ua=Radiator.WATER_UA;
    this.ratedCapacity=Radiator.RATED_CAPACITY;
    this.minimumApproach=Radiator.MINIMUM_APPROACH;
    this.thermalTransferRevision=Radiator.PERFORMANCE_REVISION;
    this.power=Radiator.FAN_POWER;
    this.fanAirflow=2.5;
    this.wasteHeatFraction=.15;
    this.direction={x:direction.x??1,y:direction.y??0};
    this.outdoor=Boolean(outdoor);
    this.airInTemperature=25;
    this.airOutTemperature=25;
    this.fanBoost=1;
    this.naturalAirflow=0.28;
    this.rejectedToExterior=this.outdoor;
  }
}
