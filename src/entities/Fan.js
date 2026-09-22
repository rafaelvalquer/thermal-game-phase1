import { Entity } from './Entity.js';
export class Fan extends Entity {
  constructor(x,y,direction={x:1,y:0}) { super('fan',x,y); this.direction=direction; this.airflow=3.5; this.range=10; this.power=300; this.wasteHeatFraction=.2; }
}
