import { Entity } from './Entity.js';

export const BATTERY_CAPACITY_KWH=50;
export const BATTERY_MAX_POWER_W=10000;
export const BATTERY_ROUND_TRIP_EFFICIENCY=.9;

export class PowerBattery extends Entity {
  constructor(x,y,{storedEnergyJ=0,...rest}={}){
    super('battery',x,y);
    this.name='Banco de baterias';
    this.capacityJ=BATTERY_CAPACITY_KWH*3_600_000;
    this.maxChargePowerW=BATTERY_MAX_POWER_W;
    this.maxDischargePowerW=BATTERY_MAX_POWER_W;
    this.roundTripEfficiency=BATTERY_ROUND_TRIP_EFFICIENCY;
    this.storedEnergyJ=Math.max(0,Math.min(this.capacityJ,Number(storedEnergyJ)||0));
    this.chargePowerW=0;this.dischargePowerW=0;this.operationState='IDLE';
    this.power=0;
    Object.assign(this,rest);
    this.capacityJ=BATTERY_CAPACITY_KWH*3_600_000;
    this.maxChargePowerW=BATTERY_MAX_POWER_W;this.maxDischargePowerW=BATTERY_MAX_POWER_W;
    this.storedEnergyJ=Math.max(0,Math.min(this.capacityJ,Number(this.storedEnergyJ)||0));
    this.chargePowerW=0;this.dischargePowerW=0;this.operationState='IDLE';this.power=0;
  }
  get storedEnergyKWh(){return this.storedEnergyJ/3_600_000;}
  get chargePercent(){return this.capacityJ?100*this.storedEnergyJ/this.capacityJ:0;}
}
