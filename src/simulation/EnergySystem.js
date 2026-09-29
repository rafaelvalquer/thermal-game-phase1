import { isPowered, powerEquipment } from './PowerState.js';
export class EnergySystem {
  constructor(world,metrics){this.world=world;this.metrics=metrics;this.baseline=0;this.constructionDelta=0;this.energyBalanceTimer=0;this.energyBalanceInterval=.25;}
  initialize(){this.baseline=this.totalInternalEnergy();}

  totalInternalEnergy(){
    let total=this.world.totalTileEnergy();
    for(const e of powerEquipment(this.world)){
      if(e.isHeatMachine||['pipe','pump','tank','radiator','exchanger'].includes(e.type))total+=e.energy||0;
    }
    return total;
  }

  registerConstructionDelta(delta){this.constructionDelta+=delta;}

  update(dt,options={}){
    this.monitor?.begin?.('energyAccountingMs');
    try{return this.updateAccounting(dt,options);}finally{this.monitor?.end?.('energyAccountingMs');}
  }

  updateAccounting(dt,{billingDt=dt}={}){
    const world=this.world;let power=0;
    if(world.batteryDispatch)power=world.batteryDispatch.currentGridPowerW({breakerOpen:Boolean(world.datacenter?.powerGrid?.breakerOpen)});
    else for(const e of powerEquipment(world))if(isPowered(e)&&e.power)power+=e.power;
    for(const e of world.wasteHeatEquipment?.()||powerEquipment(world)){
      if(!isPowered(e)||!e.power)continue;
      const waste=e.power*(e.wasteHeatFraction??0)*dt;
      if(waste>0){
        if(e.type==='pump'&&typeof e.energy==='number')e.energy+=waste;
        else if(world.inBounds(e.x,e.y))world.addEnergyAt(e.x,e.y,waste);
        this.metrics.generatedHeat+=waste;
      }
    }
    this.metrics.powerDraw=power;
    this.metrics.powerEnergy+=power*billingDt;
    this.energyBalanceTimer+=dt;
    if(this.energyBalanceTimer>=this.energyBalanceInterval){this.energyBalanceTimer%=this.energyBalanceInterval;const current=this.totalInternalEnergy();this.metrics.energyBalance=this.baseline+this.constructionDelta+this.metrics.generatedHeat-this.metrics.externalEnergy-current;}
  }
}
