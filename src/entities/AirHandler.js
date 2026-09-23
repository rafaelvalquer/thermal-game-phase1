import { Entity } from './Entity.js';
import { HVAC_PORT_LAYOUT } from '../simulation/hvac/ports/HVACPortLayout.js';

export class AirHandler extends Entity {
  constructor(x,y,{name='Air Handler',maxAirFlow=2.5,coolingCapacity=25000,evaporatorUA=2200,targetSupplyTemperature=14,cop=3.5,fanPower=1200,enabled=true,rotation=0,direction=null}={}){
    super('airHandler',x,y);this.name=name;this.maxAirFlow=maxAirFlow;this.coolingCapacity=coolingCapacity;
    this.evaporatorUA=evaporatorUA;this.targetSupplyTemperature=targetSupplyTemperature;this.cop=cop;this.fanPower=fanPower;
    this.power=fanPower;this.wasteHeatFraction=1;this.enabled=enabled;this.returnTemperature=25;this.supplyTemperature=25;
    this.rotation=((rotation%4)+4)%4;this.direction=direction?{...direction}:{x:1,y:0};
    if(!direction)for(let i=0;i<this.rotation;i++)this.direction={x:-this.direction.y,y:this.direction.x};
    this.direction={x:Object.is(this.direction.x,-0)?0:this.direction.x,y:Object.is(this.direction.y,-0)?0:this.direction.y};
    this.localPorts=HVAC_PORT_LAYOUT.airHandler;
    this.coolingDemand=0;this.coolingPower=0;this.compressorPower=0;this.currentFlow=0;this.supplyFlow=0;this.returnFlow=0;
    this.supplyAvailableFlow=0;this.returnAvailableFlow=0;this.flowImbalance=0;
    this.status='NO SUPPLY VENT';this.condenserId=null;this.networkIds=[];this.supplyPressure=0;this.returnPressure=0;
    this.refrigerantCircuitId=null;this.refrigerantStatus='NO REFRIGERANT LINE';this.actualRoomCooling=0;
  }

  port(type){
    const base=this.localPorts[type];if(!base)return null;
    let x=base.x,y=base.y;
    for(let i=0;i<this.rotation;i++)[x,y]=[-y,x];
    return {type,x:this.x+x,y:this.y+y,dx:x,dy:y,direction:{x,y},color:this.localPorts[type].color,entity:this};
  }

  getPorts(){return Object.keys(this.localPorts).map(type=>this.port(type));}

  rotate(){
    this.rotation=(this.rotation+1)%4;this.direction={x:1,y:0};
    for(let i=0;i<this.rotation;i++)this.direction={x:-this.direction.y,y:this.direction.x};
    this.direction={x:Object.is(this.direction.x,-0)?0:this.direction.x,y:Object.is(this.direction.y,-0)?0:this.direction.y};
    this.world?.bumpUtilityTopology?.();return this.rotation;
  }
}
