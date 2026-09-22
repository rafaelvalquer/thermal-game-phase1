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
    const g=this.grid,rhsScale=AIR.density*g.dx*g.dx/Math.max(dt,1e-6);
    g.pressure.fill(0);g.pressureNext.fill(0);

    for(let iter=0;iter<this.iterations;iter++){
      for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
        const i=g.cellIndex(x,y);
        if(g.solid[i]){g.pressureNext[i]=0;continue;}
        let sum=0,count=0;

        const add=(nx,ny)=>{
          if(nx<0||ny<0||nx>=g.width||ny>=g.height){count++;return;}
          const ni=g.cellIndex(nx,ny);
          if(g.solid[ni])return;
          sum+=g.pressure[ni];count++;
        };

        add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);
        g.pressureNext[i]=count?(sum-rhsScale*g.divergence[i])/count:0;
      }
      [g.pressure,g.pressureNext]=[g.pressureNext,g.pressure];
    }
    g.world.airPressure=g.pressure;
  }

  project(dt){
    const g=this.grid,scale=dt/(AIR.density*g.dx);

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
