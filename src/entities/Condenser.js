import { Entity } from './Entity.js';
import { HVAC_PORT_LAYOUT } from '../simulation/hvac/ports/HVACPortLayout.js';

export class Condenser extends Entity {
  constructor(x,y,{name='Condenser',coolingCapacity=30000,cop=3.5,fanPower=700,enabled=true,rotation=0,direction=null}={}){
    super('condenser',x,y);this.name=name;this.coolingCapacity=coolingCapacity;this.cop=cop;
    this.fanPower=fanPower;this.power=0;this.enabled=enabled;this.outdoorTemperature=25;this.availableCapacity=coolingCapacity;
    this.heatRejected=0;this.electricalPower=0;this.compressorPower=0;this.condenserFanPower=0;this.status='IDLE';this.airHandlerId=null;this.indoor=true;
    this.rotation=((rotation%4)+4)%4;this.direction=direction?{...direction}:{x:1,y:0};
    if(!direction)for(let i=0;i<this.rotation;i++)this.direction={x:-this.direction.y,y:this.direction.x};
    this.direction={x:Object.is(this.direction.x,-0)?0:this.direction.x,y:Object.is(this.direction.y,-0)?0:this.direction.y};
    this.refrigerantCircuitId=null;this.coolingLoad=0;
    this.ports={refrigerant:{type:'refrigerant',color:HVAC_PORT_LAYOUT.condenser.refrigerant.color}};
  }

  refrigerantPort(){
    const local=HVAC_PORT_LAYOUT.condenser.refrigerant;let x=local.x,y=local.y;for(let i=0;i<this.rotation;i++)[x,y]=[-y,x];
    return {type:'refrigerant',x:this.x+x,y:this.y+y,dx:x,dy:y,direction:{x,y},color:local.color,entity:this};
  }
}
