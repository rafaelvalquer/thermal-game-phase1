import { Entity } from './Entity.js';

const DUCT={area:.25,diameter:.56,resistance:3.8};

export class AirDuct extends Entity {
  constructor(x,y,{embedded=false,temperature=25,insulated=false,flowWeight=1}={}){
    super('duct',x,y);
    this.size='duct';this.crossSectionArea=DUCT.area;this.hydraulicDiameter=DUCT.diameter;
    this.roughness=.00015;this.baseResistance=DUCT.resistance;this.resistance=DUCT.resistance;
    this.flowRate=0;this.airTemperature=temperature;this.pressure=0;this.pressureLoss=0;this.velocity=0;this.thermalPower=0;
    this.upstreamId=null;this.downstreamId=null;this.embedded=embedded;
    this.insulated=insulated;this.leakRate=0;this.humidity=0;this.condensationRisk=false;
    this.networkId=null;this.networkRole=null;this.networkStatus='DISCONNECTED';this.direction={x:0,y:0};this.flowWeight=flowWeight;
  }
}
