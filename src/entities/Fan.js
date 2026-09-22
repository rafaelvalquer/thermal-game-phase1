import { Entity } from './Entity.js';

export class Fan extends Entity {
  constructor(x,y,direction={x:1,y:0}){
    super('fan',x,y);
    this.direction=direction;
    this.qFree=1.8;
    this.pressureShutoff=120;
    this.efficiency=.65;
    this.faceArea=.65;
    this.power=300;
    this.wasteHeatFraction=.2;

    this.currentFlow=0;
    this.currentPressureRise=0;
    this.currentVelocity=0;
    this.operatingPoint=0;
    this.airflow=0;
  }
}
