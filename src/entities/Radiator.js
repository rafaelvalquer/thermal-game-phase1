import { Pipe } from './Pipe.js';
export class Radiator extends Pipe {
  constructor(x,y){ super(x,y,{mass:12}); this.type='radiator'; this.resistance=5; this.ua=1400; }
}
