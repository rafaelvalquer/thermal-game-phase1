import { Machine } from './Machine.js';
import { computeRackModel } from './ComputeRackModels.js';

export class ComputeRack extends Machine {
  static normalizeDirection(direction){
    const x=Number(direction?.x)||0,y=Number(direction?.y)||0;
    if(Math.abs(x)<1e-9&&Math.abs(y)<1e-9)return {x:0,y:-1};
    return Math.abs(x)>=Math.abs(y)?{x:Math.sign(x),y:0}:{x:0,y:Math.sign(y)};
  }

  constructor(x,y,{specialization='cpu',modelId='basic',assetId=null,airIntakeDirection={x:0,y:-1},
    temperature=25,enabled=true,powerBlocked=false,utilization=0,currentPowerW=null,...rest}={}){
    const model=computeRackModel(specialization,modelId);
    if(!model)throw new Error('Modelo de rack computacional inválido: '+specialization+'/'+modelId);
    const maxPowerW=Number(rest.maxPowerW??model.maxPowerW),idlePowerW=Number(rest.idlePowerW??model.idlePowerW);
    const effectivePower=currentPowerW==null?idlePowerW:Number(currentPowerW);
    super(x,y,{name:model.specialization.toUpperCase()+' · '+model.label,heatOutput:effectivePower,mass:model.mass,heatCapacity:model.heatCapacity,
      temperature,startAt:0,failureTemperature:model.failureTemperature,category:'computeRack',...rest});
    this.type='computeRack';this.assetId=assetId||'compute-'+this.id;this.specialization=specialization;this.modelId=modelId;
    this.capacity={...model.capacity};this.idlePowerW=idlePowerW;this.maxPowerW=maxPowerW;
    this.currentPowerW=effectivePower;this.utilization=Math.max(0,Math.min(1,Number(utilization)||0));
    this.requestedPower=effectivePower;this.power=effectivePower;this.heatOutput=effectivePower;this.baseHeatOutput=effectivePower;
    this.slaTemperature=Number(rest.slaTemperature??model.slaTemperature);this.visualId=model.visualId;
    this.airIntakeDirection=ComputeRack.normalizeDirection(airIntakeDirection);
    this.airExhaustDirection={x:this.airIntakeDirection.x===0?0:-this.airIntakeDirection.x,y:this.airIntakeDirection.y===0?0:-this.airIntakeDirection.y};
    this.inletTemperature=temperature;this.exhaustTemperature=temperature;this.status='IDLE';
    this.enabled=Boolean(enabled);this.powerBlocked=Boolean(powerBlocked);
  }

  setUtilization(value){
    this.utilization=Math.max(0,Math.min(1,Number(value)||0));
    this.currentPowerW=this.enabled?this.idlePowerW+(this.maxPowerW-this.idlePowerW)*this.utilization:0;
    this.requestedPower=this.currentPowerW;this.power=this.currentPowerW;this.heatOutput=this.currentPowerW;this.baseHeatOutput=this.currentPowerW;
    return this.currentPowerW;
  }

  normalizeAirflowDirections(){
    this.airIntakeDirection=ComputeRack.normalizeDirection(this.airIntakeDirection);
    this.airExhaustDirection={x:this.airIntakeDirection.x===0?0:-this.airIntakeDirection.x,y:this.airIntakeDirection.y===0?0:-this.airIntakeDirection.y};
  }
}
