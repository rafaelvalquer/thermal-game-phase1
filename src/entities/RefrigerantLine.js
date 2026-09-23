import { Entity } from './Entity.js';

export class RefrigerantLine extends Entity {
  constructor(x,y,{embedded=false,temperature=12,insulated=true}={}){
    super('refrigerantLine',x,y);
    this.embedded=embedded;this.insulated=insulated;this.temperature=temperature;
    this.length=.5;this.pressureLoss=0;this.capacityFactor=1;
    this.circuitId=null;this.circuitStatus='OPEN CIRCUIT';this.networkStatus='OPEN CIRCUIT';
    this.direction={x:0,y:0};this.flowRate=0;this.world=null;
  }
}
