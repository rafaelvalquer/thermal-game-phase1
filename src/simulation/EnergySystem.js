export class EnergySystem {
  constructor(world,metrics){this.world=world;this.metrics=metrics;this.baseline=0;this.constructionDelta=0;}
  initialize(){this.baseline=this.totalInternalEnergy();}

  totalInternalEnergy(){
    let total=this.world.totalTileEnergy();
    for(const e of this.world.entities){
      if(e.isHeatMachine||['pipe','pump','tank','radiator','exchanger'].includes(e.type))total+=e.energy||0;
    }
    return total;
  }

  registerConstructionDelta(delta){this.constructionDelta+=delta;}

  update(dt){
    let power=0;
    for(const e of this.world.entities){
      if(!e.enabled||!e.power)continue;
      power+=e.power;
      const waste=e.power*(e.wasteHeatFraction??0)*dt;
      if(waste>0){
        if(e.type==='pump'&&typeof e.energy==='number')e.energy+=waste;
        else if(this.world.inBounds(e.x,e.y))this.world.addEnergyAt(e.x,e.y,waste);
        this.metrics.generatedHeat+=waste;
      }
    }
    this.metrics.powerDraw=power;
    this.metrics.powerEnergy+=power*dt;
    const current=this.totalInternalEnergy();
    this.metrics.energyBalance=this.baseline+this.constructionDelta+this.metrics.generatedHeat-this.metrics.externalEnergy-current;
  }
}
