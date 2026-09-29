import { AIR, AIR_FACE_AREA } from './AirConstants.js';

export class AirThermalAdvection {
  constructor(grid,metrics){
    this.grid=grid;this.metrics=metrics;
    this.exteriorCells=grid.exteriorCells;
    this.airMetricTopologyVersion=-1;this.airMetricIndices=new Int32Array(0);
    this.exteriorUFaces=new Set();this.exteriorVFaces=new Set();
    this.exteriorOpeningFaces=(grid.world.airExteriorOpenings||[]).map(({x,y,direction})=>{
      if(direction.x){
        const index=grid.uIndex(direction.x>0?x+1:x,y);this.exteriorUFaces.add(index);
        return {x,y,kind:'u',index,sign:direction.x};
      }
      const index=grid.vIndex(x,direction.y>0?y+1:y);this.exteriorVFaces.add(index);
      return {x,y,kind:'v',index,sign:direction.y};
    });
  }

  advect(dt){
    if(dt<=0){this.sampleAirMetrics();return;}
    const g=this.grid,{width,height}=g;
    let maxOutgoing=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(g.solid[i])continue;
      const out=Math.max(0,-g.u[y*(width+1)+x])+Math.max(0,g.u[y*(width+1)+x+1])+Math.max(0,-g.v[i])+Math.max(0,g.v[i+width]);
      maxOutgoing=Math.max(maxOutgoing,out);
    }
    const steps=Math.max(1,Math.ceil(maxOutgoing*dt/(g.dx*.8)));
    for(let step=0;step<steps;step++)this.advectStep(dt/steps);
  }

  advectStep(dt){
    const g=this.grid,w=g.world,{width,height,solid}=g;
    w.nextEnergy.set(w.energy);

    for(let y=0;y<height;y++)for(let x=1;x<width;x++){
      const face=y*(width+1)+x,left=y*width+x-1,right=left+1;if(solid[left]||solid[right]||this.exteriorUFaces.has(face))continue;
      const u=g.u[face];
      if(Math.abs(u)<AIR.minRenderableVelocity)continue;
      this.exchangeAcrossFace(left,right,u,dt,AIR_FACE_AREA);
    }

    for(let y=1;y<height;y++)for(let x=0;x<width;x++){
      const face=y*width+x,top=face-width,bottom=face;if(solid[top]||solid[bottom]||this.exteriorVFaces.has(face))continue;
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
    const g=this.grid,w=g.world;
    if(this.airMetricTopologyVersion!==w.thermalStatisticsVersion){
      let count=0;for(let i=0;i<g.size;i++)if(w.isAirIndex(i))count++;
      const indices=new Int32Array(count);let cursor=0;for(let i=0;i<g.size;i++)if(w.isAirIndex(i))indices[cursor++]=i;
      this.airMetricIndices=indices;this.airMetricTopologyVersion=w.thermalStatisticsVersion;
    }
    let sum=0,max=-Infinity;for(const i of this.airMetricIndices){const temperature=w.temperatureAtIndex(i);sum+=temperature;max=Math.max(max,temperature);}
    const count=this.airMetricIndices.length;this.metrics.airTemperatureSum=sum;this.metrics.maxAirTemp=count?max:0;this.metrics.airCellCount=count;
  }

  refreshExteriorAir(){
    const g=this.grid,w=g.world,ambient=w.environment.temperature;let sum=0,max=-Infinity,count=0;
    // Tiles outside declared room footprints model the unlimited outdoor
    // atmosphere, so transported heat cannot accumulate beside the building.
    for(let i=0;i<g.size;i++){
      if(this.exteriorCells[i]&&!g.solid[i]){
        const target=w.capacityAtIndex(i)*ambient,q=w.nextEnergy[i]-target;
        if(Math.abs(q)>=1e-10){w.nextEnergy[i]=target;w.environment.energyReceived+=q;this.metrics.externalEnergy=(this.metrics.externalEnergy||0)+q;}
      }
      if(w.isAirIndex(i)){const temperature=w.nextEnergy[i]/w.capacityAtIndex(i);sum+=temperature;max=Math.max(max,temperature);count++;}
    }
    this.metrics.airTemperatureSum=sum;this.metrics.maxAirTemp=count?max:0;this.metrics.airCellCount=count;
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
