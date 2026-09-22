import { Pipe } from './Pipe.js';

export class Radiator extends Pipe {
  constructor(x,y){
    super(x,y,{mass:12});
    this.type='radiator';
    this.resistance=5;
    this.ua=1400;
    this.airInTemperature=25;
    this.airOutTemperature=25;
    this.fanBoost=1;
    this.naturalAirflow=0.28;
  }
}
