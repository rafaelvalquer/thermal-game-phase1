import { Entity } from './Entity.js';
import { AIR } from '../simulation/air/AirConstants.js';

export class ExhaustFan extends Entity {
  constructor(x,y,direction={x:1,y:0}){
    super('exhaust',x,y);
    this.direction=direction;
    this.qFree=3.2;
    this.pressureShutoff=220;
    this.captureRadius=AIR.exhaustCaptureRadius;
    this.captureStrength=AIR.exhaustCaptureStrength;
    this.status='NO OUTLET';
    this.heatRejectedPower=0;
    this.efficiency=.68;
    this.faceArea=.72;
    this.power=500;
    this.wasteHeatFraction=.2;

    this.currentFlow=0;
    this.currentPressureRise=0;
    this.currentVelocity=0;
    this.operatingPoint=0;
    this.flowEfficiency=0;
    this.airflow=0;
  }
}
