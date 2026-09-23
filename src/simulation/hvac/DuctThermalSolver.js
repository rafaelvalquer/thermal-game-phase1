import { HVAC } from './HVACConstants.js';

export class DuctThermalSolver {
  constructor(world){this.world=world;this.ductTemperatureTotals=new Map();}

  beginStep(){this.ductTemperatureTotals.clear();}

  transfer(duct,inletTemperature,flowRate,dt){
    const index=this.world.index(duct.x,duct.y),material=this.world.materialAt(duct.x,duct.y);
    const ambient=this.world.temperatureAt(duct.x,duct.y),ua=(duct.embedded?HVAC.embeddedUA:HVAC.exposedUA)*(duct.insulated?.18:1);
    const branchCapacityRate=flowRate*HVAC.airDensity*HVAC.airCp;
    const totalCapacityRate=Math.max(branchCapacityRate,(duct.flowRate||flowRate)*HVAC.airDensity*HVAC.airCp);
    if(branchCapacityRate<=0){duct.airTemperature=inletTemperature;return inletTemperature;}
    const outlet=ambient+(inletTemperature-ambient)*Math.exp(-ua/totalCapacityRate);
    let heatIntoAir=branchCapacityRate*(outlet-inletTemperature);
    if(Number.isFinite(heatIntoAir)&&Math.abs(heatIntoAir)>0){
      const branchShare=branchCapacityRate/totalCapacityRate;
      const maxTransfer=this.world.capacityAtIndex(index)*Math.abs(ambient-inletTemperature)*.2/Math.max(dt,1e-9)*branchShare;
      heatIntoAir=Math.sign(heatIntoAir)*Math.min(Math.abs(heatIntoAir),maxTransfer);
      // Keep the wall's energy change and the modeled outlet temperature in
      // agreement, so duct heat exchange does not create or discard energy.
      this.world.energy[index]-=heatIntoAir*dt;
    }
    const actualOutlet=inletTemperature+heatIntoAir/branchCapacityRate;
    duct.airTemperature=actualOutlet;duct.thermalPower=heatIntoAir;
    const totals=this.ductTemperatureTotals.get(duct.id)||{temperature:0,flow:0,power:0};
    totals.temperature+=actualOutlet*flowRate;totals.flow+=flowRate;totals.power+=heatIntoAir;this.ductTemperatureTotals.set(duct.id,totals);
    return actualOutlet;
  }

  commitTemperatures(){
    const byId=new Map(this.world.allUtilities().map(item=>[item.id,item]));
    for(const [id,total] of this.ductTemperatureTotals){
      if(total.flow<=0)continue;
      const duct=byId.get(id);if(!duct)continue;
      duct.airTemperature=total.temperature/total.flow;duct.thermalPower=total.power;
    }
  }

  solvePath(path,flowRate,startTemperature,dt){
    let temperature=startTemperature;
    for(const node of path){if(node.kind==='duct')temperature=this.transfer(node.entity,temperature,flowRate,dt);}
    return temperature;
  }
}
