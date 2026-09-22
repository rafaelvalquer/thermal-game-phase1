import { Entity } from './Entity.js';

export class ExhaustFan extends Entity {
  constructor(x,y,direction={x:1,y:0}){
    super('exhaust',x,y);
    this.direction=direction;
    this.qFree=2.4;
    this.pressureShutoff=180;
    this.efficiency=.68;
    this.faceArea=.72;
    this.power=500;
    this.wasteHeatFraction=.2;

    this.currentFlow=0;
    this.currentPressureRise=0;
    this.currentVelocity=0;
    this.operatingPoint=0;
    this.airflow=0;
  }
}
