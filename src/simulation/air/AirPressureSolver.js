import { AIR } from './AirConstants.js';
import { AirFaceTopologyCache } from './AirFaceTopologyCache.js';

export class AirPressureSolver {
  constructor(grid,options={}){
    this.grid=grid;
    this.topology=options.topology||new AirFaceTopologyCache(grid);
    this.iterations=options.iterations??AIR.pressureIterations;
    this.adaptive=options.adaptive??!Object.hasOwn(options,'iterations');
    this.iterationsUsed=0;this.earlyExit=false;
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
    const g=this.grid,rhsScale=AIR.density*g.dx*g.dx/Math.max(dt,1e-6),cells=this.adaptive?(g.projectionPressureCells||g.interiorPressureCells):g.pressureCells,cellCount=this.adaptive?(g.projectionPressureCellCount??g.interiorPressureCellCount):g.pressureCellCount;
    const left=g.pressureLeft,right=g.pressureRight,up=g.pressureUp,down=g.pressureDown,counts=g.pressureNeighborCount,divergence=g.divergence;
    let pressure=g.pressure,pressureNext=g.pressureNext;
    pressureNext.set(pressure);
    const exteriorPressure=0;
    pressure[g.size]=exteriorPressure;pressureNext[g.size]=exteriorPressure;

    const maxIterations=this.adaptive?AIR.pressureMaxIterations:this.iterations;
    this.iterationsUsed=0;this.earlyExit=false;
    for(let iter=0;iter<maxIterations;iter++){
      let maxDelta=0;
      for(let cell=0;cell<cellCount;cell++){
        const i=cells[cell];
        const sum=pressure[left[i]]+pressure[right[i]]+pressure[up[i]]+pressure[down[i]];
        const count=counts[i];
        const next=count?(sum-rhsScale*divergence[i])/count:0;
        pressureNext[i]=next;maxDelta=Math.max(maxDelta,Math.abs(next-pressure[i]));
      }
      const swap=pressure;pressure=pressureNext;pressureNext=swap;
      pressure[g.size]=exteriorPressure;pressureNext[g.size]=exteriorPressure;
      this.iterationsUsed=iter+1;
      if(this.adaptive&&this.iterationsUsed>=AIR.pressureMinIterations&&this.iterationsUsed%AIR.pressureCheckInterval===0&&maxDelta<AIR.pressureTolerance){this.earlyExit=true;break;}
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

    const topology=this.topology;topology.ensure();
    for(let face=0;face<topology.velocityUFaces.length;face++){
      const ui=topology.velocityUFaces[face],left=g.cellIndex(topology.velocityUX[face]-1,topology.velocityUY[face]),right=left+1;
      g.u[ui]-=scale*(g.pressure[right]-g.pressure[left]);
    }

    for(let face=0;face<topology.velocityVFaces.length;face++){
      const x=topology.velocityVX[face],y=topology.velocityVY[face],vi=topology.velocityVFaces[face];
      const top=g.cellIndex(x,y-1),bottom=top+g.width;
      g.v[vi]-=scale*(g.pressure[bottom]-g.pressure[top]);
    }
  }
}
