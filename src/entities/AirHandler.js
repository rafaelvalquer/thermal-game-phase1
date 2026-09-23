import { Entity } from './Entity.js';

export class AirHandler extends Entity {
  constructor(x,y,{name='Air Handler',maxAirFlow=2.5,coolingCapacity=25000,evaporatorUA=2200,targetSupplyTemperature=14,cop=3.5,fanPower=1200,enabled=true}={}){
    super('airHandler',x,y);this.name=name;this.maxAirFlow=maxAirFlow;this.coolingCapacity=coolingCapacity;
    this.evaporatorUA=evaporatorUA;this.targetSupplyTemperature=targetSupplyTemperature;this.cop=cop;this.fanPower=fanPower;
    this.power=fanPower;this.wasteHeatFraction=1;this.enabled=enabled;this.returnTemperature=25;this.supplyTemperature=25;
    this.coolingDemand=0;this.coolingPower=0;this.compressorPower=0;this.currentFlow=0;this.supplyFlow=0;this.returnFlow=0;
    this.supplyAvailableFlow=0;this.returnAvailableFlow=0;this.flowImbalance=0;
    this.status='NO SUPPLY VENT';this.condenserId=null;this.networkIds=[];this.supplyPressure=0;this.returnPressure=0;
  }
}
