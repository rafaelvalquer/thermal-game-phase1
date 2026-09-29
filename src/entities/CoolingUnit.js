import { Entity } from './Entity.js';
import { COOLING_UNIT_BALANCE_REVISION, COOLING_UNIT_MODELS } from './CoolingUnitModels.js';

/** A self-contained packaged air conditioner for the simplified campaign. */
export class CoolingUnit extends Entity {
  constructor(x,y,{
    name='Condensadora',ratedCoolingCapacity,maxAirFlow,targetSupplyTemperature=14,
    cop,fanPower,enabled=true,tier='commercial',direction={x:1,y:0}
  }={}){
    super('coolingUnit',x,y);
    const model=COOLING_UNIT_MODELS[tier]||COOLING_UNIT_MODELS.commercial;
    ratedCoolingCapacity??=model.ratedCoolingCapacity;maxAirFlow??=model.maxAirFlow;cop??=model.cop;fanPower??=model.fanPower;
    this.name=name;this.direction={...direction};this.ratedCoolingCapacity=ratedCoolingCapacity;this.coolingCapacity=ratedCoolingCapacity;
    this.footprintLength=tier==='industrial'?2:1;
    this.maxAirFlow=maxAirFlow;this.targetSupplyTemperature=targetSupplyTemperature;this.cop=cop;this.fanPower=fanPower;
    this.enabled=enabled;this.tier=tier;this.coolingBalanceRevision=COOLING_UNIT_BALANCE_REVISION;this.networkId=null;this.currentAirFlow=0;this.currentCooling=0;
    this.electricalPower=0;this.rejectedHeat=0;this.loadRatio=0;this.availableCapacity=ratedCoolingCapacity;
    this.outdoorTemperature=25;this.indoor=true;this.returnTemperature=25;this.supplyTemperature=targetSupplyTemperature;
    this.status='DISCONNECTED';this.networkStatus='DISCONNECTED';this.coolingLoad=0;this.power=0;
    this.heatRejected=0;this.fanActive=false;this.fanSpeed=0;
  }
}
