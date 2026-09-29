import { isPowered, powerEquipment } from './PowerState.js';
import { BATTERY_ROUND_TRIP_EFFICIENCY } from '../entities/PowerBattery.js';

const batteriesInPositionOrder=world=>world.entitiesByType('battery').sort((a,b)=>a.y-b.y||a.x-b.x||a.id-b.id);
const solarPanels=world=>world.entitiesByType('solarPanel').sort((a,b)=>a.y-b.y||a.x-b.x||a.id-b.id);
const nonBatteryLoad=world=>powerEquipment(world).reduce((sum,e)=>sum+(
  e.type!=='battery'&&isPowered(e)?Math.max(0,e.requestedPower??e.power??0):0
),0);

export class BatteryDispatchSystem {
  constructor(world,metrics){this.world=world;this.metrics=metrics;this.gridPowerW=0;this.chargePowerW=0;this.gridChargePowerW=0;this.solarChargePowerW=0;this.solarGenerationW=0;this.dischargePowerW=0;this.lastDispatchSeconds=0;this.dispatchLedger=[];}

  dispatch(capacityW,dt,{disabled=false}={}){
    const batteries=batteriesInPositionOrder(this.world),panels=solarPanels(this.world),load=nonBatteryLoad(this.world),capacity=Number.isFinite(capacityW)&&capacityW>0?capacityW:Infinity;
    const duration=Math.max(0,Number(dt)||0),eta=Math.sqrt(BATTERY_ROUND_TRIP_EFFICIENCY);
    const hour=this.world.datacenter?.clock?.hour??this.world.solarHour??12;
    this.solarGenerationW=panels.reduce((sum,panel)=>sum+panel.updateGeneration(hour),0);
    const netLoad=Math.max(0,load-this.solarGenerationW),solarSurplus=Math.max(0,this.solarGenerationW-load);
    let remainingCharge=Math.max(0,solarSurplus+capacity-netLoad),remainingSolar=solarSurplus,remainingDischarge=Math.max(0,netLoad-capacity);
    this.chargePowerW=0;this.gridChargePowerW=0;this.solarChargePowerW=0;this.dischargePowerW=0;this.lastDispatchSeconds=duration;this.dispatchLedger=[];
    this.metrics.solarGenerationW=this.solarGenerationW;
    for(const battery of batteries){
      battery.chargePowerW=0;battery.dischargePowerW=0;battery.operationState=battery.enabled?'IDLE':'OFF';
    }
    if(!disabled&&duration>0){
      if(remainingDischarge>0){
        for(const battery of batteries){
          if(!isPowered(battery)||remainingDischarge<=1e-9||battery.storedEnergyJ<=0)continue;
          const output=Math.min(battery.maxDischargePowerW,remainingDischarge,battery.storedEnergyJ*eta/duration);
          if(output<=0)continue;
          const removed=output*duration/eta,loss=removed-output*duration;
          battery.storedEnergyJ=Math.max(0,battery.storedEnergyJ-removed);
          battery.dischargePowerW=output;battery.operationState='DISCHARGING';
          this.dispatchLedger.push({battery,energyDelta:-removed,loss,previousState:'IDLE'});
          this.addLossHeat(battery,loss);this.dischargePowerW+=output;remainingDischarge-=output;
        }
      }else if(remainingCharge>0){
        for(const battery of batteries){
          if(!isPowered(battery)||remainingCharge<=1e-9||battery.storedEnergyJ>=battery.capacityJ)continue;
          const input=Math.min(battery.maxChargePowerW,remainingCharge,(battery.capacityJ-battery.storedEnergyJ)/(eta*duration));
          if(input<=0)continue;
          const solarInput=Math.min(input,remainingSolar),gridInput=input-solarInput,stored=input*duration*eta,loss=input*duration-stored;
          battery.storedEnergyJ=Math.min(battery.capacityJ,battery.storedEnergyJ+stored);
          battery.chargePowerW=input;battery.operationState=battery.storedEnergyJ>=battery.capacityJ-1?'FULL':'CHARGING';
          this.dispatchLedger.push({battery,energyDelta:stored,loss,previousState:'IDLE'});
          this.addLossHeat(battery,loss);this.chargePowerW+=input;this.solarChargePowerW+=solarInput;this.gridChargePowerW+=gridInput;remainingSolar-=solarInput;remainingCharge-=input;
        }
      }
    }
    for(const battery of batteries)if(battery.enabled&&battery.operationState==='IDLE'){
      if(battery.storedEnergyJ>=battery.capacityJ-1)battery.operationState='FULL';
      else if(battery.storedEnergyJ<=0)battery.operationState='EMPTY';
    }
    this.gridPowerW=this.currentGridPowerW();
    return {loadW:load,solarGenerationW:this.solarGenerationW,chargeW:this.chargePowerW,solarChargeW:this.solarChargePowerW,gridChargeW:this.gridChargePowerW,dischargeW:this.dischargePowerW,gridPowerW:this.gridPowerW};
  }

  addLossHeat(battery,energy){
    if(!(energy>0))return;
    if(this.world.inBounds(battery.x,battery.y))this.world.addEnergyAt(battery.x,battery.y,energy);
    this.metrics.generatedHeat+=energy;
  }

  reconcileAfterProtection(capacityW,{disabled=false}={}){
    const duration=this.lastDispatchSeconds;
    for(const record of this.dispatchLedger){
      record.battery.storedEnergyJ=Math.max(0,Math.min(record.battery.capacityJ,record.battery.storedEnergyJ-record.energyDelta));
      if(record.loss>0){
        if(this.world.inBounds(record.battery.x,record.battery.y))this.world.addEnergyAt(record.battery.x,record.battery.y,-record.loss);
        this.metrics.generatedHeat-=record.loss;
      }
    }
    this.dispatchLedger=[];
    return this.dispatch(capacityW,duration,{disabled});
  }

  currentGridPowerW({breakerOpen=false}={}){
    if(breakerOpen)return 0;
    const load=nonBatteryLoad(this.world),generation=solarPanels(this.world).reduce((sum,panel)=>sum+(isPowered(panel)?panel.generationW||0:0),0),batteries=batteriesInPositionOrder(this.world);
    const charging=this.gridChargePowerW;
    const discharging=batteries.reduce((sum,b)=>sum+(isPowered(b)?b.dischargePowerW||0:0),0);
    return Math.max(0,load-generation+charging-discharging);
  }
}
