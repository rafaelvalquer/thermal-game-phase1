import { AIR } from './AirConstants.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class AirVelocitySolver {
  constructor(grid){this.grid=grid;}

  advect(dt){
    const g=this.grid,dx=g.dx;
    g.uNext.set(g.u);g.vNext.set(g.v);

    for(let y=0;y<g.height;y++)for(let x=1;x<g.width;x++){
      const i=g.uIndex(x,y);
      if(g.blockedU(x,y)){g.uNext[i]=0;continue;}
      const px=x*dx,py=(y+.5)*dx,vel=g.sampleVelocity(px,py);
      const bx=px-vel.x*dt,by=py-vel.y*dt;
      g.uNext[i]=g.sampleU(bx,by);
    }

    for(let y=1;y<g.height;y++)for(let x=0;x<g.width;x++){
      const i=g.vIndex(x,y);
      if(g.blockedV(x,y)){g.vNext[i]=0;continue;}
      const px=(x+.5)*dx,py=y*dx,vel=g.sampleVelocity(px,py);
      const bx=px-vel.x*dt,by=py-vel.y*dt;
      g.vNext[i]=g.sampleV(bx,by);
    }

    [g.u,g.uNext]=[g.uNext,g.u];
    [g.v,g.vNext]=[g.vNext,g.v];
    this.diffuseAndDamp(dt);
  }

  diffuseAndDamp(dt){
    const g=this.grid,nu=AIR.eddyViscosity,scale=nu*dt/(g.dx*g.dx),damp=Math.max(0,1-AIR.velocityDamping*dt);
    g.uNext.set(g.u);g.vNext.set(g.v);

    for(let y=1;y<g.height-1;y++)for(let x=1;x<g.width;x++){
      const i=g.uIndex(x,y);if(g.blockedU(x,y)){g.uNext[i]=0;continue;}
      const lap=g.u[g.uIndex(x-1,y)]+g.u[g.uIndex(x+1,y)]+g.u[g.uIndex(x,y-1)]+g.u[g.uIndex(x,y+1)]-4*g.u[i];
      g.uNext[i]=clamp((g.u[i]+scale*lap)*damp,-AIR.maxVelocity,AIR.maxVelocity);
    }

    for(let y=1;y<g.height;y++)for(let x=1;x<g.width-1;x++){
      const i=g.vIndex(x,y);if(g.blockedV(x,y)){g.vNext[i]=0;continue;}
      const lap=g.v[g.vIndex(x-1,y)]+g.v[g.vIndex(x+1,y)]+g.v[g.vIndex(x,y-1)]+g.v[g.vIndex(x,y+1)]-4*g.v[i];
      g.vNext[i]=clamp((g.v[i]+scale*lap)*damp,-AIR.maxVelocity,AIR.maxVelocity);
    }

    [g.u,g.uNext]=[g.uNext,g.u];
    [g.v,g.vNext]=[g.vNext,g.v];
  }
}
