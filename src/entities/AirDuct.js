import { Entity } from './Entity.js';

const SIZES={
  smallDuct:{area:.08,diameter:.28,resistance:15,cost:80},
  mediumDuct:{area:.18,diameter:.48,resistance:5,cost:140},
  largeDuct:{area:.35,diameter:.7,resistance:1.8,cost:230},
};

export class AirDuct extends Entity {
  constructor(x,y,{size='mediumDuct',embedded=false,temperature=25,insulated=false,role='supply'}={}){
    const spec=SIZES[size]||SIZES.mediumDuct;
    super(size,x,y);
    this.size=size;this.crossSectionArea=spec.area;this.hydraulicDiameter=spec.diameter;
    this.roughness=.00015;this.baseResistance=spec.resistance;this.resistance=spec.resistance;
    this.flowRate=0;this.airTemperature=temperature;this.pressure=0;this.pressureLoss=0;this.velocity=0;this.thermalPower=0;
    this.upstreamId=null;this.downstreamId=null;this.embedded=embedded;
    this.role=role==='return'?'return':'supply';
    this.insulated=insulated;this.leakRate=0;this.humidity=0;this.condensationRisk=false;
    this.networkId=null;this.networkStatus='DISCONNECTED';this.direction={x:0,y:0};
  }
}
