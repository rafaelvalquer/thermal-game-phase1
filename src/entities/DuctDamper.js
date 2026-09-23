import { Entity } from './Entity.js';

export class DuctDamper extends Entity {
  constructor(x,y,{opening=1}={}){
    super('ductDamper',x,y);this.opening=Math.max(0,Math.min(1,opening));this.resistance=0;
    this.networkId=null;this.networkStatus='DISCONNECTED';
  }
  setOpening(value){this.opening=Math.max(0,Math.min(1,value));}
}
