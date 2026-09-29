import { TILE_AREA, TILE_SIZE_METERS } from '../../utils/Constants.js';
import { harmonicMean } from '../../utils/MathUtils.js';
import { SimulationConfig } from '../SimulationConfig.js';

export class ThermalTopologyCache {
  constructor(world){this.world=world;this.sourceVersion=-1;this.edgeA=new Int32Array(0);this.edgeB=new Int32Array(0);this.conductance=new Float64Array(0);this.equalizationScale=new Float64Array(0);this.inverseCapacity=new Float64Array(world.size);this.edgeCount=0;this.rebuildCount=0;this.monitor=null;}

  ensureCurrent(){
    if(this.sourceVersion===this.world.materialTopologyVersion)return false;
    const world=this.world,maxEdges=Math.max(0,(world.width-1)*world.height+world.width*(world.height-1)),edgeA=new Int32Array(maxEdges),edgeB=new Int32Array(maxEdges),conductance=new Float64Array(maxEdges),equalizationScale=new Float64Array(maxEdges),inverseCapacity=new Float64Array(world.size),scale=TILE_AREA/TILE_SIZE_METERS*SimulationConfig.conductionScale;
    for(let i=0;i<world.size;i++)inverseCapacity[i]=1/world.capacityAtIndex(i);
    let edgeCount=0;
    for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
      const a=world.index(x,y),conductivityA=world.thermalConductivity[a];
      if(x+1<world.width)edgeCount=this.addEdge(edgeA,edgeB,conductance,equalizationScale,edgeCount,a,a+1,conductivityA,world.thermalConductivity[a+1],scale,inverseCapacity);
      if(y+1<world.height)edgeCount=this.addEdge(edgeA,edgeB,conductance,equalizationScale,edgeCount,a,a+world.width,conductivityA,world.thermalConductivity[a+world.width],scale,inverseCapacity);
    }
    this.edgeA=edgeA.slice(0,edgeCount);this.edgeB=edgeB.slice(0,edgeCount);this.conductance=conductance.slice(0,edgeCount);this.equalizationScale=equalizationScale.slice(0,edgeCount);this.inverseCapacity=inverseCapacity;this.edgeCount=edgeCount;this.sourceVersion=world.materialTopologyVersion;this.rebuildCount++;this.monitor?.count?.('thermalTopologyRebuildCount');return true;
  }

  addEdge(edgeA,edgeB,conductance,equalizationScale,index,a,b,conductivityA,conductivityB,scale,inverseCapacity){
    const edgeConductance=harmonicMean(conductivityA,conductivityB)*scale;
    if(edgeConductance<=0)return index;
    edgeA[index]=a;edgeB[index]=b;conductance[index]=edgeConductance;
    equalizationScale[index]=1/(inverseCapacity[a]+inverseCapacity[b]);
    return index+1;
  }
}
