import { AIR, AIR_FACE_AREA } from './AirConstants.js';

export class AirThermalAdvection {
  constructor(grid,metrics){this.grid=grid;this.metrics=metrics;}

  advect(dt){
    if(dt<=0)return;
    const g=this.grid;
    let maxOutgoing=0;
    for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
      if(!g.isAir(x,y))continue;
      const out=Math.max(0,-g.u[g.uIndex(x,y)])+Math.max(0,g.u[g.uIndex(x+1,y)])+Math.max(0,-g.v[g.vIndex(x,y)])+Math.max(0,g.v[g.vIndex(x,y+1)]);
      maxOutgoing=Math.max(maxOutgoing,out);
    }
    const steps=Math.max(1,Math.ceil(maxOutgoing*dt/(g.dx*.8)));
    for(let step=0;step<steps;step++)this.advectStep(dt/steps);
  }

  advectStep(dt){
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

    // Open boundaries carry enthalpy out of the simulated domain. Incoming air
    // is at the reference outdoor temperature and carries zero excess enthalpy.
    for(let y=0;y<g.height;y++){
      this.exchangeOutdoor(0,y,-g.u[g.uIndex(0,y)],dt);
      this.exchangeOutdoor(g.width-1,y,g.u[g.uIndex(g.width,y)],dt);
    }
    for(let x=0;x<g.width;x++){
      this.exchangeOutdoor(x,0,-g.v[g.vIndex(x,0)],dt);
      this.exchangeOutdoor(x,g.height-1,g.v[g.vIndex(x,g.height)],dt);
    }

    w.energy.set(w.nextEnergy);
  }

  exchangeOutdoor(x,y,outwardVelocity,dt){
    const g=this.grid,w=g.world;
    if(outwardVelocity<=0||!g.isAir(x,y))return;
    const i=w.index(x,y),q=AIR.density*AIR.cp*AIR_FACE_AREA*outwardVelocity*(w.temperatureAtIndex(i)-w.environment.temperature)*dt;
    w.nextEnergy[i]-=q;w.environment.energyReceived+=q;
    this.metrics.externalEnergy=(this.metrics.externalEnergy||0)+q;
  }

  exchangeAcrossFace(a,b,velocity,dt,area){
    const g=this.grid,w=g.world;
    if(!g.isAir(a.x,a.y)||!g.isAir(b.x,b.y))return;
    const ia=w.index(a.x,a.y),ib=w.index(b.x,b.y);
    const Ta=w.temperatureAtIndex(ia),Tb=w.temperatureAtIndex(ib);
    // Transport donor enthalpy relative to the outdoor reference, rather than
    // diffusing the temperature difference symmetrically in both directions.
    // Every internal face subtracts and adds exactly the same energy.
    const dT=(velocity>=0?Ta:Tb)-w.environment.temperature;
    if(Math.abs(dT)<1e-6)return;

    const massFlow=AIR.density*Math.abs(velocity)*area;
    const q=massFlow*AIR.cp*dT*dt;

    if(velocity>=0){
      w.nextEnergy[ia]-=q;w.nextEnergy[ib]+=q;
    }else{
      w.nextEnergy[ib]-=q;w.nextEnergy[ia]+=q;
    }
  }
}
