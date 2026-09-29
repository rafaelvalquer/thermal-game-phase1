import { AIR } from './AirConstants.js';

export class AirPressureSolver {
  constructor(grid,{iterations=AIR.pressureIterations}={}){
    this.grid=grid;
    this.iterations=iterations;
  }

  computeDivergence(){
    const g=this.grid,invDx=1/g.dx;
    let max=0;
    for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
      const i=g.cellIndex(x,y);
      if(g.solid[i]){g.divergence[i]=0;continue;}
      const d=(g.u[g.uIndex(x+1,y)]-g.u[g.uIndex(x,y)]+g.v[g.vIndex(x,y+1)]-g.v[g.vIndex(x,y)])*invDx;
      g.divergence[i]=d;max=Math.max(max,Math.abs(d));
    }
    return max;
  }

  solve(dt){
    const g=this.grid,rhsScale=AIR.density*g.dx*g.dx/Math.max(dt,1e-6),cells=g.pressureCells,cellCount=g.pressureCellCount;
    const left=g.pressureLeft,right=g.pressureRight,up=g.pressureUp,down=g.pressureDown,counts=g.pressureNeighborCount,divergence=g.divergence;
    let pressure=g.pressure,pressureNext=g.pressureNext;
    pressureNext.set(pressure);
    const exteriorPressure=0;
    pressure[g.size]=exteriorPressure;pressureNext[g.size]=exteriorPressure;

    for(let iter=0;iter<this.iterations;iter++){
      for(let cell=0;cell<cellCount;cell++){
        const i=cells[cell];
        if(g.exteriorCells[i]){pressureNext[i]=exteriorPressure;continue;}
        const sum=pressure[left[i]]+pressure[right[i]]+pressure[up[i]]+pressure[down[i]];
        const count=counts[i];
        pressureNext[i]=count?(sum-rhsScale*divergence[i])/count:0;
      }
      const swap=pressure;pressure=pressureNext;pressureNext=swap;
      pressure[g.size]=exteriorPressure;pressureNext[g.size]=exteriorPressure;
    }
    g.pressure=pressure;g.pressureNext=pressureNext;g.world.airPressure=pressure;
  }

  project(dt){
    const g=this.grid,scale=dt/(AIR.density*g.dx);

    // Open map edges use zero-gauge atmospheric pressure. Boundary.enforce()
    // removes the inward component after this projection.
    for(let y=0;y<g.height;y++){
      const left=g.cellIndex(0,y),leftFace=g.uIndex(0,y);
      if(!g.blockedU(0,y))g.u[leftFace]-=scale*g.pressure[left];
      const right=g.cellIndex(g.width-1,y),rightFace=g.uIndex(g.width,y);
      if(!g.blockedU(g.width,y))g.u[rightFace]+=scale*g.pressure[right];
    }
    for(let x=0;x<g.width;x++){
      const top=g.cellIndex(x,0),topFace=g.vIndex(x,0);
      if(!g.blockedV(x,0))g.v[topFace]-=scale*g.pressure[top];
      const bottom=g.cellIndex(x,g.height-1),bottomFace=g.vIndex(x,g.height);
      if(!g.blockedV(x,g.height))g.v[bottomFace]+=scale*g.pressure[bottom];
    }

    for(let y=0;y<g.height;y++)for(let x=1;x<g.width;x++){
      const ui=g.uIndex(x,y);
      if(g.blockedU(x,y)){g.u[ui]=0;continue;}
      const pL=g.pressure[g.cellIndex(x-1,y)],pR=g.pressure[g.cellIndex(x,y)];
      g.u[ui]-=scale*(pR-pL);
    }

    for(let y=1;y<g.height;y++)for(let x=0;x<g.width;x++){
      const vi=g.vIndex(x,y);
      if(g.blockedV(x,y)){g.v[vi]=0;continue;}
      const pT=g.pressure[g.cellIndex(x,y-1)],pB=g.pressure[g.cellIndex(x,y)];
      g.v[vi]-=scale*(pB-pT);
    }
  }
}
