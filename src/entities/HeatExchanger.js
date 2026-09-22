import { Pipe } from './Pipe.js';
export class HeatExchanger extends Pipe {
  constructor(x,y){ super(x,y,{mass:10}); this.type='exchanger'; this.resistance=4; this.ua=1500; }
}
