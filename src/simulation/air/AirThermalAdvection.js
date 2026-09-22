import { AIR, AIR_FACE_AREA } from './AirConstants.js';

export class AirThermalAdvection {
  constructor(grid,metrics){this.grid=grid;this.metrics=metrics;}

  advect(dt){
    const g=this.grid,w=g.world;
    w.nextEnergy.set(w.energy);

    for(let y=0;y<g.height;y++)for(let x=1;x<g.width;x++){
      if(g.blockedU(x,y))continue;
      const u=g.u[g.uIndex(x,y)];
      if(Math.abs(u)<AIR.minRenderableVelocity)continue;
      const left={x:x-1,y},right={x,y};
      this.exchangeAcrossFace(left,right,u,dt,AIR_FACE_AREA);
    }

    for(let y=1;y<g.height;y++)for(let x=0;x<g.width;x++){
      if(g.blockedV(x,y))continue;
      const v=g.v[g.vIndex(x,y)];
      if(Math.abs(v)<AIR.minRenderableVelocity)continue;
      const top={x,y:y-1},bottom={x,y};
      this.exchangeAcrossFace(top,bottom,v,dt,AIR_FACE_AREA);
    }

    w.energy.set(w.nextEnergy);
  }

  exchangeAcrossFace(a,b,velocity,dt,area){
    const g=this.grid,w=g.world;
    if(!g.isAir(a.x,a.y)||!g.isAir(b.x,b.y))return;
    const ia=w.index(a.x,a.y),ib=w.index(b.x,b.y);
    const Ta=w.temperatureAtIndex(ia),Tb=w.temperatureAtIndex(ib);
    const dT=velocity>=0?Ta-Tb:Tb-Ta;
    if(Math.abs(dT)<1e-6)return;

    const massFlow=AIR.density*Math.abs(velocity)*area;
    let q=massFlow*AIR.cp*dT*dt;
    const Ca=w.capacityAtIndex(ia),Cb=w.capacityAtIndex(ib);
    const qEq=Math.abs(Ta-Tb)/(1/Ca+1/Cb);
    const limit=qEq*.45;
    if(q>limit)q=limit;
    if(q<-limit)q=-limit;

    if(velocity>=0){
      w.nextEnergy[ia]-=q;w.nextEnergy[ib]+=q;
    }else{
      w.nextEnergy[ib]-=q;w.nextEnergy[ia]+=q;
    }
  }
}
