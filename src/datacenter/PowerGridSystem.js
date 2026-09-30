export const POWER_BASE_CAPACITY_KW=100;
export const POWER_MAX_CAPACITY_KW=10000;
export const POWER_BASE_MONTHLY_COST=3000;
// Half the historical 100 -> 250 kW installation and monthly increments.
export const POWER_INSTALL_COST_PER_KW=50000/150/2;
export const POWER_MONTHLY_COST_PER_KW=4000/150/2;

export const powerInstallationCost=addedKW=>Math.round(addedKW*POWER_INSTALL_COST_PER_KW);
export const powerMonthlyFixedCost=capacityKW=>Math.round(POWER_BASE_MONTHLY_COST+Math.max(0,capacityKW-POWER_BASE_CAPACITY_KW)*POWER_MONTHLY_COST_PER_KW);

import { isPowered, powerEquipment } from '../simulation/PowerState.js';

const positionOrder=(a,b)=>a.y-b.y||a.x-b.x;
const demand=entity=>entity.enabled?Math.max(0,entity.requestedPower??entity.power??0):0;
const fallbackLoad=equipment=>{let total=0;for(const entity of equipment)if(entity.type!=='battery'&&entity.type!=='solarPanel')total+=demand(entity);return total;};
const fallbackOperatingLoad=equipment=>{let total=0;for(const entity of equipment)if(entity.type!=='battery'&&entity.type!=='solarPanel'&&isPowered(entity))total+=demand(entity);return total;};

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
    const snapshot=world.batteryDispatch?.snapshot,grossDemand=snapshot?.valid?snapshot.grossLoadW:fallbackLoad(equipment),solar=world.batteryDispatch?.solarGenerationW||0;
    this.demandKW=Math.max(0,grossDemand-solar+(world.batteryDispatch?.gridChargePowerW??world.batteryDispatch?.chargePowerW??0))/1000;
    this.effectiveKW=(world.batteryDispatch?.currentGridPowerW({breakerOpen:this.breakerOpen})??fallbackOperatingLoad(equipment))/1000;
    const racks=world.powerEquipmentSetByType?.('serverRack')||[...equipment].filter(entity=>entity.type==='serverRack');let blocked=0;
    for(const rack of racks){
      if(rack.enabled&&rack.powerBlocked)blocked++;
      if(rack.powerBlocked){rack.power=0;rack.currentPowerKW=0;rack.heatOutputKW=0;rack.heatGenerationPower=0;rack.started=false;if(rack.enabled)rack.status='POWER_OFF';}
      else if(rack.enabled){rack.power=demand(rack);rack.currentPowerKW=rack.power/1000;rack.heatOutputKW=rack.currentPowerKW*.98;}
    }
    this.blockedRacks=blocked;
  }
  update(world,dt){
    const equipment=powerEquipment(world),capacity=this.capacityKW*1000;
    if(this.breakerOpen){for(const e of equipment)if(e.enabled)e.powerBlocked=true;this.refresh(world);return;}
    let draw=world.batteryDispatch?.currentGridPowerW()??fallbackOperatingLoad(equipment);
    this.overloadSeconds=draw>capacity?this.overloadSeconds+dt:0;
    if(draw>capacity*1.1||(draw>capacity&&this.overloadSeconds+1e-9>=5)){
      const racks=[...(world.powerEquipmentSetByType?.('serverRack')||equipment.filter(e=>e.type==='serverRack'))].filter(isPowered).sort((a,b)=>demand(b)-demand(a)||positionOrder(a,b));
      let changed=false;
      for(const rack of racks){if(draw<=capacity)break;draw-=demand(rack);rack.powerBlocked=true;changed=true;}
      if(draw>capacity){this.breakerOpen=true;for(const e of equipment)if(e.enabled)e.powerBlocked=true;}
      if(changed||this.breakerOpen)world.batteryDispatch?.reconcileAfterProtection(capacity,{disabled:this.breakerOpen});
      this.overloadSeconds=0;
    }
    this.refresh(world);
  }
  rearm(world){
    const equipment=powerEquipment(world),capacity=this.capacityKW*1000;
    const racks=world.powerEquipmentSetByType?.('serverRack')||[...equipment].filter(e=>e.type==='serverRack'),wasOpen=this.breakerOpen;
    const infrastructure=[...equipment].filter(e=>e.type!=='serverRack');let restored=0;
    if(wasOpen){
      for(const entity of equipment)if(entity.enabled)entity.powerBlocked=false;
      world.batteryDispatch?.snapshot?.clear();
      world.batteryDispatch?.dispatch(capacity,0,{disabled:false});
      this.breakerOpen=false;
      let draw=world.batteryDispatch?.currentGridPowerW()??fallbackOperatingLoad(equipment);
      const candidates=[...racks].filter(isPowered).sort((a,b)=>demand(b)-demand(a)||positionOrder(a,b));
      for(const rack of candidates){if(draw<=capacity)break;draw-=demand(rack);rack.powerBlocked=true;}
      if(draw>capacity){this.breakerOpen=true;for(const entity of equipment)if(entity.enabled)entity.powerBlocked=true;this.refresh(world);return {ok:false,restored:0,remaining:this.blockedRacks,reason:'A carga ainda excede a capacidade da rede.'};}
      for(const rack of racks)if(rack.enabled&&!rack.powerBlocked){restored++;rack.status='NORMAL';}
    }else{
      let draw=world.batteryDispatch?.currentGridPowerW()??fallbackOperatingLoad(equipment);
      for(const rack of [...racks].filter(e=>e.powerBlocked).sort((a,b)=>demand(a)-demand(b)||positionOrder(a,b))){
        if(draw+demand(rack)>capacity)continue;rack.powerBlocked=false;draw+=demand(rack);if(rack.enabled){restored++;rack.status='NORMAL';}
      }
    }
    if(!this.breakerOpen)this.overloadSeconds=0;
    this.refresh(world);
    return {ok:true,restored,remaining:this.blockedRacks};
  }
  quote(addedKW){
    const amount=Number(addedKW);
    if(!Number.isInteger(amount)||amount<1)return {ok:false,reason:'Informe uma quantidade inteira de pelo menos 1 kW.'};
    if(amount>this.remainingCapacityKW)return {ok:false,reason:'A capacidade máxima da rede é 10.000 kW.'};
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
