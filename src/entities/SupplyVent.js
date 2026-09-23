import { Entity } from './Entity.js';

export class SupplyVent extends Entity {
  constructor(x,y,{direction={x:0,y:1},throwCoefficient=1}={}){
    super('supplyVent',x,y);this.direction={...direction};this.throwCoefficient=throwCoefficient;
    this.area=.08;
    this.flowRate=0;this.dischargeVelocity=0;this.airTemperature=25;this.coolingDelivered=0;
    this.networkId=null;this.networkStatus='DISCONNECTED';this.pressure=0;
  }
}
