import { Entity } from './Entity.js';

/** A self-contained packaged air conditioner for the simplified campaign. */
export class CoolingUnit extends Entity {
  constructor(x,y,{
    name='Condensadora',ratedCoolingCapacity=25000,maxAirFlow=2.5,targetSupplyTemperature=14,
    cop=3.5,fanPower=700,enabled=true,tier='commercial',direction={x:1,y:0}
  }={}){
    super('coolingUnit',x,y);
    this.name=name;this.direction={...direction};this.ratedCoolingCapacity=ratedCoolingCapacity;this.coolingCapacity=ratedCoolingCapacity;
    this.maxAirFlow=maxAirFlow;this.targetSupplyTemperature=targetSupplyTemperature;this.cop=cop;this.fanPower=fanPower;
    this.enabled=enabled;this.tier=tier;this.networkId=null;this.currentAirFlow=0;this.currentCooling=0;
    this.electricalPower=0;this.rejectedHeat=0;this.loadRatio=0;this.availableCapacity=ratedCoolingCapacity;
    this.outdoorTemperature=25;this.indoor=true;this.returnTemperature=25;this.supplyTemperature=targetSupplyTemperature;
    this.status='DISCONNECTED';this.networkStatus='DISCONNECTED';this.coolingLoad=0;this.power=0;
    this.heatRejected=0;this.fanActive=false;this.fanSpeed=0;
  }
}
