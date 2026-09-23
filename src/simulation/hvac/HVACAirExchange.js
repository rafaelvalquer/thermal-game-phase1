import { HVAC } from './HVACConstants.js';
import { clamp } from '../../utils/MathUtils.js';

export class HVACAirExchange {
  constructor(world,airflow){this.world=world;this.airflow=airflow;this.roomReferenceTemperature=world.environment.temperature;}
  setRoomReferenceTemperature(value){if(Number.isFinite(value))this.roomReferenceTemperature=value;}

  returnTemperature(vent){
    const w=this.world,cells=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const x=vent.x+dx,y=vent.y+dy;if(w.inBounds(x,y)&&w.isAir(x,y)){const distance=Math.hypot(dx,dy);cells.push({x,y,weight:1/(1+distance)});}
    }
    const total=cells.reduce((sum,cell)=>sum+cell.weight,0);
    return total?cells.reduce((sum,cell)=>sum+w.temperatureAt(cell.x,cell.y)*cell.weight,0)/total:w.environment.temperature;
  }

  fallbackReturnTemperature(handler){
    const cells=[];for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
      const x=handler.x+dx,y=handler.y+dy;if(this.world.inBounds(x,y)&&this.world.isAir(x,y))cells.push({x,y,d:Math.hypot(dx,dy)});
    }
    if(!cells.length)return this.world.environment.temperature;
    return cells.reduce((sum,cell)=>sum+this.world.temperatureAt(cell.x,cell.y)/(1+cell.d),0)/cells.reduce((sum,cell)=>sum+1/(1+cell.d),0);
  }

  transferMassEnergy(vent,dt,direction){
    if(!vent.flowRate||!this.world.inBounds(vent.x,vent.y)||!this.world.isAir(vent.x,vent.y))return 0;
    const i=this.world.index(vent.x,vent.y),roomT=this.world.temperatureAtIndex(i),capacity=this.world.capacityAtIndex(i);
    const mass=this.world.massAt(vent.x,vent.y),fraction=clamp((vent.flowRate*HVAC.airDensity*dt)/Math.max(mass,1e-6),0,.35);
    const incomingTemperature=direction==='supply'?vent.airTemperature:this.roomReferenceTemperature;
    const energyDelta=capacity*fraction*(incomingTemperature-roomT);
    this.world.energy[i]+=energyDelta;
    return energyDelta/dt;
  }

  applySupply(vent,dt){return this.transferMassEnergy(vent,dt,'supply');}
  applyReturn(vent,dt){return this.transferMassEnergy(vent,dt,'return');}

  applyMomentum(sources,dt){
    const grid=this.airflow?.grid;if(!grid)return;
    for(const {vent,kind} of sources){
      if(vent.flowRate<=0||!grid.inCell(vent.x,vent.y)||grid.isSolid(vent.x,vent.y))continue;
      // A supply direction points into the room; a return direction points
      // from the room into the vent. Both therefore use the same vector sign.
      const d=vent.direction||{x:0,y:kind==='supply'?1:-1},area=vent.area??HVAC.tileLength*2.5;
      const volumeVelocity=vent.flowRate/Math.max(area,1e-6)*(vent.throwCoefficient??1);
      if(d.x>0&&vent.x+1<grid.width)grid.u[grid.uIndex(vent.x+1,vent.y)]+=volumeVelocity;
      else if(d.x<0&&vent.x>0)grid.u[grid.uIndex(vent.x,vent.y)]-=volumeVelocity;
      else if(d.y>0&&vent.y+1<grid.height)grid.v[grid.vIndex(vent.x,vent.y+1)]+=volumeVelocity;
      else if(d.y<0&&vent.y>0)grid.v[grid.vIndex(vent.x,vent.y)]-=volumeVelocity;
    }
    this.airflow.boundaries.enforce();this.airflow.pressure.computeDivergence();this.airflow.pressure.solve(dt);this.airflow.pressure.project(dt);this.airflow.boundaries.enforce();this.airflow.pressure.computeDivergence();grid.syncWorldVelocity();this.airflow.diagnostics.update();
  }
}
