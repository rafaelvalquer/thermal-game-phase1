import { Entity } from './Entity.js';
import { WATER_CP } from '../utils/Constants.js';
export class Pipe extends Entity {
  constructor(x,y,{mass=5,temperature=25}={}) { super('pipe',x,y); this.waterMass=mass; this.energy=mass*WATER_CP*temperature; this.resistance=1; this.flowRate=0; }
  get waterTemperature(){ return this.energy/(this.waterMass*WATER_CP); }
}
