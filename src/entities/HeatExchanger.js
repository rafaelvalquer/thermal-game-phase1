import { Pipe } from './Pipe.js';

export class HeatExchanger extends Pipe {
  static PERFORMANCE_REVISION=2;
  static WATER_UA=2250;
  static AIR_UA=2250;

  constructor(x,y){
    super(x,y,{mass:10});
    this.type='exchanger';
    this.resistance=4;
    this.ua=HeatExchanger.WATER_UA;
    this.airUA=HeatExchanger.AIR_UA;
    this.thermalTransferRevision=HeatExchanger.PERFORMANCE_REVISION;
    this.airCoolingPower=0;
    this.machineId=null;
  }
}
