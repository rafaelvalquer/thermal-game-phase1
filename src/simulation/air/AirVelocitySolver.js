import { AIR } from './AirConstants.js';
import { AirFaceTopologyCache } from './AirFaceTopologyCache.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class AirVelocitySolver {
  constructor(grid,topology=null){this.grid=grid;this.topology=topology||new AirFaceTopologyCache(grid);}

  advect(dt){
    const g=this.grid,dx=g.dx,topology=this.topology;topology.ensure();
    g.uNext.set(g.u);g.vNext.set(g.v);

    for(let face=0;face<topology.velocityUFaces.length;face++){
      const i=topology.velocityUFaces[face],x=topology.velocityUX[face],y=topology.velocityUY[face];
      const px=x*dx,py=(y+.5)*dx,vx=g.sampleU(px,py),vy=g.sampleV(px,py);
      if(vx===0&&vy===0){g.uNext[i]=g.u[i];continue;}
      const bx=px-vx*dt,by=py-vy*dt;
      g.uNext[i]=g.sampleU(bx,by);
    }

    for(let face=0;face<topology.velocityVFaces.length;face++){
      const i=topology.velocityVFaces[face],x=topology.velocityVX[face],y=topology.velocityVY[face];
      const px=(x+.5)*dx,py=y*dx,vx=g.sampleU(px,py),vy=g.sampleV(px,py);
      if(vx===0&&vy===0){g.vNext[i]=g.v[i];continue;}
      const bx=px-vx*dt,by=py-vy*dt;
      g.vNext[i]=g.sampleV(bx,by);
    }

    [g.u,g.uNext]=[g.uNext,g.u];
    [g.v,g.vNext]=[g.vNext,g.v];
    this.diffuseAndDamp(dt);
  }

  faceConfinementU(x,y){
    const g=this.grid;
    const left=g.cellIndex(x-1,y),right=g.cellIndex(x,y);
    return (g.wallConfinement[left]+g.wallConfinement[right])*.5;
  }

  faceConfinementV(x,y){
    const g=this.grid;
    const top=g.cellIndex(x,y-1),bottom=g.cellIndex(x,y);
    return (g.wallConfinement[top]+g.wallConfinement[bottom])*.5;
  }

  diffuseAndDamp(dt){
    const g=this.grid,baseScale=AIR.eddyViscosity*dt/(g.dx*g.dx),damp=Math.max(0,1-AIR.velocityDamping*dt),topology=this.topology;
    g.uNext.set(g.u);g.vNext.set(g.v);

    for(let face=0;face<topology.velocityUFaces.length;face++){
      const x=topology.velocityUX[face],y=topology.velocityUY[face];if(y===0||y===g.height-1)continue;
      const i=topology.velocityUFaces[face];
      const lap=g.u[g.uIndex(x-1,y)]+g.u[g.uIndex(x+1,y)]+g.u[g.uIndex(x,y-1)]+g.u[g.uIndex(x,y+1)]-4*g.u[i];
      const confinement=this.faceConfinementU(x,y);
      const localScale=baseScale/(1+confinement*AIR.wallTurbulenceSuppression);
      g.uNext[i]=clamp((g.u[i]+localScale*lap)*damp,-AIR.maxVelocity,AIR.maxVelocity);
    }

    for(let face=0;face<topology.velocityVFaces.length;face++){
      const x=topology.velocityVX[face],y=topology.velocityVY[face];if(x===0||x===g.width-1)continue;
      const i=topology.velocityVFaces[face];
      const lap=g.v[g.vIndex(x-1,y)]+g.v[g.vIndex(x+1,y)]+g.v[g.vIndex(x,y-1)]+g.v[g.vIndex(x,y+1)]-4*g.v[i];
      const confinement=this.faceConfinementV(x,y);
      const localScale=baseScale/(1+confinement*AIR.wallTurbulenceSuppression);
      g.vNext[i]=clamp((g.v[i]+localScale*lap)*damp,-AIR.maxVelocity,AIR.maxVelocity);
    }

    [g.u,g.uNext]=[g.uNext,g.u];
    [g.v,g.vNext]=[g.vNext,g.v];
  }
}
