import { COOLING } from './CoolingConstants.js';
import { clamp } from '../../utils/MathUtils.js';

export class CoolingAirExchange {
  constructor(world,airflow){this.world=world;this.airflow=airflow;}
  serviceRacks(vent,radius=3){
    const reachable=new Set(this.supplyCells(vent,radius,false).map(cell=>this.world.index(cell.x,cell.y)));
    const d=vent.direction||{x:0,y:1},candidates=[];
    for(const rack of this.world.entitiesByType('serverRack')){
      const intake=rack.airIntakeDirection||{x:0,y:-1},x=rack.x+intake.x,y=rack.y+intake.y;
      if(!this.world.inBounds(x,y)||!reachable.has(this.world.index(x,y)))continue;
      const dx=x-vent.x,dy=y-vent.y,forward=dx*d.x+dy*d.y,lateral=Math.abs(dx*d.y-dy*d.x);
      if(forward<1||forward>radius||lateral>1)continue;
      const temperature=this.world.temperatureAt(x,y),excess=Math.max(0,temperature-(rack.slaTemperature??30));
      candidates.push({rack,x,y,distance:forward+lateral*.35,excess});
    }
    return candidates.sort((a,b)=>b.excess-a.excess||a.distance-b.distance).slice(0,3);
  }
  coolingDemand(vent){return this.serviceRacks(vent).reduce((sum,item)=>sum+item.excess,0);}
  supplyCells(vent,radius=3,prioritizeRacks=true){
    const w=this.world;if(!w.inBounds(vent.x,vent.y)||!w.isAir(vent.x,vent.y))return [];
    const direction=vent.direction||{x:0,y:1},queue=[{x:vent.x,y:vent.y,distance:0}],seen=new Set([w.index(vent.x,vent.y)]),cells=[];
    for(let head=0;head<queue.length;head++){
      const cell=queue[head],dx=cell.x-vent.x,dy=cell.y-vent.y,forward=dx*direction.x+dy*direction.y;
      const lateral=Math.abs(dx*direction.y-dy*direction.x);
      if(forward>=0&&lateral<=1&&forward<=radius){
        const distance=Math.hypot(dx,dy),directionBias=distance?1+.5*forward/distance:1;
        cells.push({...cell,weight:directionBias/(1+distance)});
      }else continue;
      if(cell.distance>=radius)continue;
      for(const [sx,sy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=cell.x+sx,y=cell.y+sy,ndx=x-vent.x,ndy=y-vent.y,nf=ndx*direction.x+ndy*direction.y,nl=Math.abs(ndx*direction.y-ndy*direction.x);
        if(nf<0||nf>radius||nl>1||!w.inBounds(x,y)||!w.isAir(x,y))continue;
        const index=w.index(x,y);if(seen.has(index))continue;seen.add(index);queue.push({x,y,distance:cell.distance+1});
      }
    }
    const racks=prioritizeRacks?this.serviceRacks(vent,radius):[],inlets=new Map(racks.map(item=>[w.index(item.x,item.y),item]));
    for(const cell of cells){
      const rack=inlets.get(w.index(cell.x,cell.y));
      if(rack){cell.rack=rack.rack;cell.weight*=5*(1+Math.min(20,rack.excess)/10);}
    }
    return cells;
  }
  returnTemperature(vent){
    const w=this.world,cells=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=vent.x+dx,y=vent.y+dy;if(w.inBounds(x,y)&&w.isAir(x,y)){const distance=Math.hypot(dx,dy);cells.push({x,y,weight:1/(1+distance)});}}
    const total=cells.reduce((sum,cell)=>sum+cell.weight,0);return total?cells.reduce((sum,cell)=>sum+w.temperatureAt(cell.x,cell.y)*cell.weight,0)/total:w.environment.temperature;
  }
  transferMassEnergy(vent,dt,maxCooling=Infinity,preview=null){
    if(!vent.flowRate||dt<=0)return 0;
    const cells=this.supplyCells(vent);if(!cells.length)return 0;
    const totalWeight=cells.reduce((sum,cell)=>sum+cell.weight,0)||1,changes=[];
    for(const cell of cells){
      const i=this.world.index(cell.x,cell.y),capacity=this.world.capacityAtIndex(i),mass=this.world.massAt(cell.x,cell.y),currentEnergy=preview?.get(i)??this.world.energy[i],roomT=currentEnergy/capacity;
      const localFlow=vent.flowRate*cell.weight/totalWeight,fraction=clamp((localFlow*COOLING.airDensity*dt)/Math.max(mass,1e-6),0,COOLING.maxExchangeFraction);
      changes.push({i,energyDelta:capacity*fraction*(vent.airTemperature-roomT)});
    }
    const totalCooling=changes.reduce((sum,change)=>sum+Math.min(0,change.energyDelta),0),coolingLimit=Math.max(0,maxCooling*dt),scale=Number.isFinite(coolingLimit)&&-totalCooling>coolingLimit&&totalCooling<0?coolingLimit/-totalCooling:1;
    let totalDelta=0;
    for(const change of changes){
      const energyDelta=change.energyDelta<0?change.energyDelta*scale:change.energyDelta;totalDelta+=energyDelta;
      if(preview)preview.set(change.i,(preview.get(change.i)??this.world.energy[change.i])+energyDelta);
      else this.world.energy[change.i]+=energyDelta;
    }
    return totalDelta/dt;
  }
  applySupply(vent,dt,maxCooling=Infinity){return this.transferMassEnergy(vent,dt,maxCooling);}
  applyMomentum(sources,dt){
    const grid=this.airflow?.grid;if(!grid)return;
    for(const {vent} of sources){if(vent.flowRate<=0||!grid.inCell(vent.x,vent.y)||grid.isSolid(vent.x,vent.y))continue;const d=vent.direction||{x:0,y:1},area=vent.area??.5*2.5,velocity=vent.flowRate/Math.max(area,1e-6)*(vent.throwCoefficient??1);
      if(d.x>0&&vent.x+1<grid.width)grid.u[grid.uIndex(vent.x+1,vent.y)]+=velocity;else if(d.x<0&&vent.x>0)grid.u[grid.uIndex(vent.x,vent.y)]-=velocity;else if(d.y>0&&vent.y+1<grid.height)grid.v[grid.vIndex(vent.x,vent.y+1)]+=velocity;else if(d.y<0&&vent.y>0)grid.v[grid.vIndex(vent.x,vent.y)]-=velocity;}
    this.airflow.boundaries.enforce();this.airflow.pressure.computeDivergence();this.airflow.pressure.solve(dt);this.airflow.pressure.project(dt);this.airflow.boundaries.enforce();this.airflow.pressure.computeDivergence();grid.syncWorldVelocity();this.airflow.diagnostics.update();
  }
}
