import { Pipe } from './Pipe.js';
export class Pump extends Pipe {
  constructor(x,y){ super(x,y,{mass:8}); this.type='pump'; this.power=800; this.hydraulicPower=36; this.resistance=2; this.wasteHeatFraction=.2; }
}
