import { Entity } from './Entity.js';

export class Condenser extends Entity {
  constructor(x,y,{name='Condenser',coolingCapacity=30000,cop=3.5,fanPower=700,enabled=true}={}){
    super('condenser',x,y);this.name=name;this.coolingCapacity=coolingCapacity;this.cop=cop;
    this.fanPower=fanPower;this.power=0;this.enabled=enabled;this.outdoorTemperature=25;this.availableCapacity=coolingCapacity;
    this.heatRejected=0;this.electricalPower=0;this.status='IDLE';this.airHandlerId=null;this.indoor=true;
  }
}
