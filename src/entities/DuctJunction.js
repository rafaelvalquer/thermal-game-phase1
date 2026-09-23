import { Entity } from './Entity.js';

export class DuctJunction extends Entity {
  constructor(x,y,{degree=3,networkId=null}={}){
    super('ductJunction',x,y);this.degree=degree;this.networkId=networkId;
    this.type=degree>3?'cross':'tee';
  }
}
