import { Pipe } from './Pipe.js';
export class WaterTank extends Pipe {
  constructor(x,y){ super(x,y,{mass:997,temperature:25}); this.type='tank'; this.resistance=2; }
}
