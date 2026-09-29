import { AIR, AIR_FACE_AREA } from './AirConstants.js';
import { AirFaceTopologyCache } from './AirFaceTopologyCache.js';

export class AirThermalAdvection {
  constructor(grid,metrics,faceTopology=null){
    this.grid=grid;this.metrics=metrics;
    this.exteriorCells=grid.exteriorCells;
    this.faceTopology=faceTopology||new AirFaceTopologyCache(grid);
    this.exteriorOpeningFaces=(grid.world.airExteriorOpenings||[]).map(({x,y,direction})=>{
      if(direction.x){
        const index=grid.uIndex(direction.x>0?x+1:x,y);
        return {x,y,kind:'u',index,sign:direction.x};
      }
      const index=grid.vIndex(x,direction.y>0?y+1:y);
      return {x,y,kind:'v',index,sign:direction.y};
    });
  }

  advect(dt){
    this.faceTopology.ensure();
    if(dt<=0){this.substepsUsed=0;return;}
    const g=this.grid,topology=this.faceTopology;
    let maxOutgoing=0;
    for(let c=0;c<topology.airCellCount;c++){
      const i=topology.airCells[c],x=i%g.width,y=(i/g.width)|0;
      const out=Math.max(0,-g.u[g.uIndex(x,y)])+Math.max(0,g.u[g.uIndex(x+1,y)])+Math.max(0,-g.v[g.vIndex(x,y)])+Math.max(0,g.v[g.vIndex(x,y+1)]);
      maxOutgoing=Math.max(maxOutgoing,out);
    }
    const steps=Math.max(1,Math.ceil(maxOutgoing*dt/(g.dx*.8)));
    this.substepsUsed=steps;
    for(let step=0;step<steps;step++)this.advectStep(dt/steps);
  }

  advectStep(dt){
    const g=this.grid,w=g.world,{width,height,solid}=g;
    const topology=this.faceTopology;
    w.nextEnergy.set(w.energy);

    for(let f=0;f<topology.openUCount;f++){
      const face=topology.openUFaces[f],left=topology.openULeft[f],right=topology.openURight[f];
      const u=g.u[face];
      if(Math.abs(u)<AIR.minRenderableVelocity)continue;
      this.exchangeAcrossFace(left,right,u,dt,AIR_FACE_AREA);
    }

    for(let f=0;f<topology.openVCount;f++){
      const face=topology.openVFaces[f],top=topology.openVTop[f],bottom=topology.openVBottom[f];
      const v=g.v[face];
      if(Math.abs(v)<AIR.minRenderableVelocity)continue;
      this.exchangeAcrossFace(top,bottom,v,dt,AIR_FACE_AREA);
    }

    // Open boundaries carry enthalpy out of the simulated domain. Incoming air
    // is at the reference outdoor temperature and carries zero excess enthalpy.
    for(let y=0;y<height;y++){
      this.exchangeOutdoor(0,y,-g.u[g.uIndex(0,y)],dt);
      this.exchangeOutdoor(width-1,y,g.u[g.uIndex(width,y)],dt);
    }
    for(let x=0;x<width;x++){
      this.exchangeOutdoor(x,0,-g.v[g.vIndex(x,0)],dt);
      this.exchangeOutdoor(x,height-1,g.v[g.vIndex(x,height)],dt);
    }
    for(const face of this.exteriorOpeningFaces){
      const velocity=face.kind==='u'?g.u[face.index]:g.v[face.index];
      this.exchangeOutdoor(face.x,face.y,velocity*face.sign,dt);
    }

    this.refreshExteriorAir();

    w.energy.set(w.nextEnergy);
  }

  sampleAirMetrics(){
    return null;
  }

  refreshExteriorAir(){
    const g=this.grid,w=g.world,ambient=w.environment.temperature;
    // Tiles outside declared room footprints model the unlimited outdoor
    // atmosphere, so transported heat cannot accumulate beside the building.
    const topology=this.faceTopology;
    for(let c=0;c<topology.exteriorAirCellCount;c++){
      const i=topology.exteriorAirCells[c],target=w.capacityAtIndex(i)*ambient,q=w.nextEnergy[i]-target;
      if(Math.abs(q)>=1e-10){w.nextEnergy[i]=target;w.environment.energyReceived+=q;this.metrics.externalEnergy=(this.metrics.externalEnergy||0)+q;}
    }
  }

  exchangeOutdoor(x,y,outwardVelocity,dt){
    const g=this.grid,w=g.world;
    if(outwardVelocity<=0)return;
    const i=y*g.width+x;if(g.solid[i])return;
    const q=AIR.density*AIR.cp*AIR_FACE_AREA*outwardVelocity*(w.temperatureAtIndex(i)-w.environment.temperature)*dt;
    w.nextEnergy[i]-=q;w.environment.energyReceived+=q;
    this.metrics.externalEnergy=(this.metrics.externalEnergy||0)+q;
  }

  exchangeAcrossFace(ia,ib,velocity,dt,area){
    const g=this.grid,w=g.world;
    if(g.solid[ia]||g.solid[ib])return;
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
