import { Entity } from './Entity.js';

export class ReturnVent extends Entity {
  constructor(x,y,{direction={x:0,y:-1}}={}){
    super('returnVent',x,y);this.direction={...direction};this.area=.08;this.flowRate=0;
    this.airTemperature=25;this.networkId=null;this.networkStatus='DISCONNECTED';this.pressure=0;
  }
}
