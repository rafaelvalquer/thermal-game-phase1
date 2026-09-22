import { Entity } from './Entity.js';
export class TemperatureSensor extends Entity {
  constructor(x,y){ super('sensor',x,y); this.current=25; this.max=25; this.sum=0; this.samples=0; }
  sample(temp){ this.current=temp; this.max=Math.max(this.max,temp); this.sum+=temp; this.samples++; }
  get average(){ return this.samples ? this.sum/this.samples : this.current; }
}
