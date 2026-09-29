import { AIR } from './AirConstants.js';
import { AirFaceTopologyCache } from './AirFaceTopologyCache.js';

export class AirDragSystem {
  constructor(grid,topology=null){this.grid=grid;this.topology=topology||new AirFaceTopologyCache(grid);}

  apply(dt){
    const g=this.grid,topology=this.topology;topology.ensure();
    for(let face=0;face<topology.velocityUFaces.length;face++){
      const i=topology.velocityUFaces[face],x=topology.velocityUX[face],y=topology.velocityUY[face];
      const left=g.cellIndex(x-1,y),right=g.cellIndex(x,y);
      const near=(g.wallProximity[left]+g.wallProximity[right])*.5;
      const speed=Math.abs(g.u[i]);
      g.u[i]/=1+dt*(AIR.wallDrag*near+AIR.wallDragQuadratic*near*speed);
    }

    for(let face=0;face<topology.velocityVFaces.length;face++){
      const i=topology.velocityVFaces[face],x=topology.velocityVX[face],y=topology.velocityVY[face];
      const top=g.cellIndex(x,y-1),bottom=g.cellIndex(x,y);
      const near=(g.wallProximity[top]+g.wallProximity[bottom])*.5;
      const speed=Math.abs(g.v[i]);
      g.v[i]/=1+dt*(AIR.wallDrag*near+AIR.wallDragQuadratic*near*speed);
    }
  }
}
