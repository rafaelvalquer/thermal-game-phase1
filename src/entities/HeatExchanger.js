import { Pipe } from './Pipe.js';
import { FLUID_THERMAL } from '../simulation/fluid/FluidThermalConstants.js';

export class HeatExchanger extends Pipe {
  static PERFORMANCE_REVISION=3;
  static WATER_UA=FLUID_THERMAL.exchangerUA;
  static AIR_UA=FLUID_THERMAL.exchangerAirUA;

  constructor(x,y){
    super(x,y,{mass:10});
    this.type='exchanger';
    this.resistance=4;
    this.ua=HeatExchanger.WATER_UA;
    this.airUA=HeatExchanger.AIR_UA;
    this.ratedCapacity=FLUID_THERMAL.exchangerRatedCapacity;
    this.captureFraction=FLUID_THERMAL.exchangerCaptureFraction;
    this.sourceTemperatureLift=FLUID_THERMAL.exchangerSourceTemperatureLift;
    this.recoverySeconds=FLUID_THERMAL.exchangerRecoverySeconds;
    this.airRatedCapacity=FLUID_THERMAL.exchangerAirRatedCapacity;
    this.thermalTransferRevision=HeatExchanger.PERFORMANCE_REVISION;
    this.airCoolingPower=0;
    this.directCoolingPower=0;
    this.captureMode='IDLE';
    this.machineId=null;
  }
}
