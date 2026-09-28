export const POWER_BASE_CAPACITY_KW=100;
export const POWER_MAX_CAPACITY_KW=5000;
export const POWER_BASE_MONTHLY_COST=3000;
// Half the historical 100 -> 250 kW installation and monthly increments.
export const POWER_INSTALL_COST_PER_KW=50000/150/2;
export const POWER_MONTHLY_COST_PER_KW=4000/150/2;

export const powerInstallationCost=addedKW=>Math.round(addedKW*POWER_INSTALL_COST_PER_KW);
export const powerMonthlyFixedCost=capacityKW=>Math.round(POWER_BASE_MONTHLY_COST+Math.max(0,capacityKW-POWER_BASE_CAPACITY_KW)*POWER_MONTHLY_COST_PER_KW);

import { isPowered, powerEquipment } from '../simulation/PowerState.js';

const positionOrder=(a,b)=>a.y-b.y||a.x-b.x;
const demand=entity=>entity.enabled?Math.max(0,entity.requestedPower??entity.power??0):0;
const nonBattery=equipment=>equipment.filter(entity=>entity.type!=='battery');

export class PowerGridSystem {
  constructor({capacityKW=100,overloadSeconds=0,breakerOpen=false}={}){
    this.capacityKW=capacityKW;this.overloadSeconds=overloadSeconds;this.breakerOpen=breakerOpen;
    this.demandKW=0;this.effectiveKW=0;this.blockedRacks=0;
  }
  get status(){return this.breakerOpen?'DISJUNTOR GERAL':this.blockedRacks?'CORTE SELETIVO':this.effectiveKW>this.capacityKW?'SOBRECARGA':this.effectiveKW>=this.capacityKW*.9?'ALERTA':'NORMAL';}
  get remainingSeconds(){return Math.max(0,5-this.overloadSeconds);}
  get remainingCapacityKW(){return Math.max(0,POWER_MAX_CAPACITY_KW-this.capacityKW);}
  get monthlyFixedCost(){return powerMonthlyFixedCost(this.capacityKW);}
  snapshot(){return {overloadSeconds:this.overloadSeconds,breakerOpen:this.breakerOpen};}
  refresh(world){
    const equipment=powerEquipment(world);
    this.demandKW=(nonBattery(equipment).reduce((sum,e)=>sum+demand(e),0)+(world.batteryDispatch?.chargePowerW||0))/1000;
    this.effectiveKW=(world.batteryDispatch?.currentGridPowerW({breakerOpen:this.breakerOpen})??nonBattery(equipment).reduce((sum,e)=>sum+(isPowered(e)?demand(e):0),0))/1000;
    this.blockedRacks=equipment.filter(e=>e.type==='serverRack'&&e.enabled&&e.powerBlocked).length;
    for(const rack of equipment.filter(e=>e.type==='serverRack')){
      if(rack.powerBlocked){rack.power=0;rack.currentPowerKW=0;rack.heatOutputKW=0;rack.heatGenerationPower=0;rack.started=false;if(rack.enabled)rack.status='POWER_OFF';}
      else if(rack.enabled){rack.power=demand(rack);rack.currentPowerKW=rack.power/1000;rack.heatOutputKW=rack.currentPowerKW*.98;}
    }
  }
  update(world,dt){
    const equipment=powerEquipment(world),capacity=this.capacityKW*1000;
    if(this.breakerOpen){for(const e of equipment)e.powerBlocked=true;this.refresh(world);return;}
    let draw=world.batteryDispatch?.currentGridPowerW()??nonBattery(equipment).reduce((sum,e)=>sum+(isPowered(e)?demand(e):0),0);
    this.overloadSeconds=draw>capacity?this.overloadSeconds+dt:0;
    if(draw>capacity*1.1||(draw>capacity&&this.overloadSeconds>=5)){
      const racks=equipment.filter(e=>e.type==='serverRack'&&isPowered(e)).sort((a,b)=>demand(b)-demand(a)||positionOrder(a,b));
      let changed=false;
      for(const rack of racks){if(draw<=capacity)break;draw-=demand(rack);rack.powerBlocked=true;changed=true;}
      if(draw>capacity){this.breakerOpen=true;for(const e of equipment)e.powerBlocked=true;}
      if(changed||this.breakerOpen)world.batteryDispatch?.reconcileAfterProtection(capacity,{disabled:this.breakerOpen});
      this.overloadSeconds=0;
    }
    this.refresh(world);
  }
  rearm(world){
    const equipment=powerEquipment(world),capacity=this.capacityKW*1000;
    // Include devices installed while paused under an open main breaker.
    if(this.breakerOpen)for(const e of equipment)e.powerBlocked=true;
    const infrastructure=equipment.filter(e=>e.type!=='serverRack');
    if(this.breakerOpen&&infrastructure.reduce((sum,e)=>sum+demand(e),0)>capacity){
      this.refresh(world);return {ok:false,restored:0,remaining:this.blockedRacks,reason:'A infraestrutura excede a capacidade da rede.'};
    }
    if(this.breakerOpen){this.breakerOpen=false;for(const e of infrastructure)e.powerBlocked=false;}
    let draw=world.batteryDispatch?.currentGridPowerW()??nonBattery(equipment).reduce((sum,e)=>sum+(isPowered(e)?demand(e):0),0),restored=0;
    for(const rack of equipment.filter(e=>e.type==='serverRack'&&e.powerBlocked).sort((a,b)=>demand(a)-demand(b)||positionOrder(a,b))){
      if(draw+demand(rack)>capacity)continue;
      rack.powerBlocked=false;draw+=demand(rack);if(rack.enabled){restored++;rack.status='NORMAL';}
    }
    if(draw<=capacity)this.overloadSeconds=0;
    this.refresh(world);
    return {ok:true,restored,remaining:this.blockedRacks};
  }
  quote(addedKW){
    const amount=Number(addedKW);
    if(!Number.isInteger(amount)||amount<1)return {ok:false,reason:'Informe uma quantidade inteira de pelo menos 1 kW.'};
    if(amount>this.remainingCapacityKW)return {ok:false,reason:'A capacidade máxima da rede é 5.000 kW.'};
    const capacityKW=this.capacityKW+amount,monthlyFixedCost=powerMonthlyFixedCost(capacityKW);
    return {ok:true,addedKW:amount,capacityKW,cost:powerInstallationCost(amount),monthlyFixedCost,monthlyIncrease:monthlyFixedCost-this.monthlyFixedCost};
  }
  upgrade(addedKW,cash){
    const quote=this.quote(addedKW);if(!quote.ok)return quote;
    if(!Number.isFinite(cash)||cash<quote.cost)return {ok:false,reason:'Capital insuficiente para ampliar a rede elétrica.'};
    this.capacityKW=quote.capacityKW;
    return quote;
  }
}
