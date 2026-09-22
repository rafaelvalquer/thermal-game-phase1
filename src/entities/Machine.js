import { Entity } from './Entity.js';
export class Machine extends Entity {
  constructor(x,y,{name='Machine',heatOutput=8000,mass=300,heatCapacity=500,temperature=25}={}) {
    super('machine',x,y);
    this.name=name; this.heatOutput=heatOutput; this.mass=mass; this.heatCapacity=heatCapacity;
    this.energy=mass*heatCapacity*temperature; this.started=false; this.coolingPower=0; this.overheatSeconds=0;
  }
  get temperature(){ return this.energy/(this.mass*this.heatCapacity); }
  set temperature(v){ this.energy=this.mass*this.heatCapacity*v; }
}
