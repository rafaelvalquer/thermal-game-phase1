import { TILE_AREA, TILE_SIZE_METERS } from '../../utils/Constants.js';
import { harmonicMean } from '../../utils/MathUtils.js';
import { SimulationConfig } from '../SimulationConfig.js';

export class ThermalTopologyCache {
  constructor(world){this.world=world;this.sourceVersion=-1;this.edges=[];this.rebuildCount=0;this.monitor=null;}

  ensureCurrent(){
    if(this.sourceVersion===this.world.materialTopologyVersion)return false;
    const world=this.world,edges=[],scale=TILE_AREA/TILE_SIZE_METERS*SimulationConfig.conductionScale;
    for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
      const a=world.index(x,y),conductivityA=world.thermalConductivity[a];
      if(x+1<world.width)this.addEdge(edges,a,a+1,conductivityA,world.thermalConductivity[a+1],scale);
      if(y+1<world.height)this.addEdge(edges,a,a+world.width,conductivityA,world.thermalConductivity[a+world.width],scale);
    }
    this.edges=edges;this.sourceVersion=world.materialTopologyVersion;this.rebuildCount++;this.monitor?.count?.('thermalTopologyRebuildCount');return true;
  }

  addEdge(edges,a,b,conductivityA,conductivityB,scale){
    const conductance=harmonicMean(conductivityA,conductivityB)*scale;
    if(conductance>0)edges.push({a,b,conductance});
  }
}
