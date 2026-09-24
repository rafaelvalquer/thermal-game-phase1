const REJECTION_RADIUS=2;
const FORWARD_BIAS=3;

export class CoolingHeatRejection {
  constructor(world,metrics){this.world=world;this.metrics=metrics;this.pending=[];}
  reset(){this.pending=[];}
  queue(unit,rejectedHeat){if(rejectedHeat>0)this.pending.push({unit,rejectedHeat});}

  nearbyAirCells(unit){
    const cells=[];
    const d=unit.direction||{x:1,y:0};
    for(let dy=-REJECTION_RADIUS;dy<=REJECTION_RADIUS;dy++)for(let dx=-REJECTION_RADIUS;dx<=REJECTION_RADIUS;dx++){
      const distance=Math.hypot(dx,dy);
      if(distance>REJECTION_RADIUS||!this.world.isAir(unit.x+dx,unit.y+dy)||!this.clearPath(unit.x,unit.y,unit.x+dx,unit.y+dy))continue;
      const forward=Math.max(0,dx*d.x+dy*d.y),weight=(1/(1+distance))*(1+FORWARD_BIAS*forward/REJECTION_RADIUS);
      cells.push({x:unit.x+dx,y:unit.y+dy,weight});
    }
    return cells;
  }

  clearPath(x0,y0,x1,y1){
    let x=x0,y=y0,ix=0,iy=0;
    const nx=Math.abs(x1-x0),ny=Math.abs(y1-y0),sx=Math.sign(x1-x0),sy=Math.sign(y1-y0);
    while(ix<nx||iy<ny){
      const crossing=(1+2*ix)*ny-(1+2*iy)*nx;
      if(crossing===0){
        // A ray passing exactly between four cells must not leak heat through a corner.
        if(!this.world.isAir(x+sx,y)||!this.world.isAir(x,y+sy))return false;
        x+=sx;y+=sy;ix++;iy++;
      }else if(crossing<0){x+=sx;ix++;}
      else{y+=sy;iy++;}
      if(!this.world.isAir(x,y))return false;
    }
    return true;
  }

  distribute(unit,joules){
    const cells=this.nearbyAirCells(unit);
    if(!cells.length)return false;
    const totalWeight=cells.reduce((sum,cell)=>sum+cell.weight,0);
    for(const cell of cells)this.world.addEnergyAt(cell.x,cell.y,joules*cell.weight/totalWeight);
    return true;
  }

  apply(dt){
    for(const {unit,rejectedHeat} of this.pending){
      const joules=rejectedHeat*dt;
      const distributed=unit.indoor&&this.distribute(unit,joules);
      if(!distributed){this.world.environment.energyReceived+=joules;this.metrics.externalEnergy+=joules;}
      this.metrics.generatedHeat+=(unit.electricalPower||0)*dt;
      this.metrics.coolingHeatRejected+=rejectedHeat;
    }
    this.pending=[];
  }
}
