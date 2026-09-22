import { Machine } from './Machine.js';

export class ServerRack extends Machine {
  constructor(x,y,{
    name='Server Rack',
    heatOutput=7000,
    mass=450,
    heatCapacity=520,
    temperature=25,
    startAt=10,
    airIntakeDirection={x:0,y:-1},
    airExhaustDirection={x:0,y:1},
    failureTemperature=55,
    ...rest
  }={}) {
    super(x,y,{name,heatOutput,mass,heatCapacity,temperature,startAt,failureTemperature,category:'serverRack',...rest});
    this.type='serverRack';
    this.airIntakeDirection=airIntakeDirection;
    this.airExhaustDirection=airExhaustDirection;
  }
}
