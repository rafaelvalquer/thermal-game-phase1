import { Entity } from './Entity.js';
export class ExhaustFan extends Entity {
  constructor(x,y,direction={x:1,y:0}) { super('exhaust',x,y); this.direction=direction; this.airflow=4.5; this.range=8; this.power=500; this.wasteHeatFraction=.2; this.extractionRate=0.35; }
}
