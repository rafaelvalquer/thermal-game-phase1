import { Machine } from './Machine.js';

export class Furnace extends Machine {
  constructor(x,y,{
    name='Forno industrial',
    heatOutput=50000,
    mass=8000,
    heatCapacity=600,
    temperature=800,
    startAt=0,
    ...rest
  }={}) {
    super(x,y,{name,heatOutput,mass,heatCapacity,temperature,startAt,failureTemperature:null,category:'furnace',...rest});
    this.type='furnace';
    this.nominalTemperature=800;
  }
}
