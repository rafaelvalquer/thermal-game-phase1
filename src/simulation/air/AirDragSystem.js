import { AIR } from './AirConstants.js';

export class AirDragSystem {
  constructor(grid){this.grid=grid;}

  apply(dt){
    const g=this.grid;
    for(let y=0;y<g.height;y++)for(let x=1;x<g.width;x++){
      const i=g.uIndex(x,y);if(g.blockedU(x,y))continue;
      const left=g.cellIndex(x-1,y),right=g.cellIndex(x,y);
      const near=(g.wallProximity[left]+g.wallProximity[right])*.5;
      const speed=Math.abs(g.u[i]);
      g.u[i]/=1+dt*(AIR.wallDrag*near+AIR.wallDragQuadratic*near*speed);
    }

    for(let y=1;y<g.height;y++)for(let x=0;x<g.width;x++){
      const i=g.vIndex(x,y);if(g.blockedV(x,y))continue;
      const top=g.cellIndex(x,y-1),bottom=g.cellIndex(x,y);
      const near=(g.wallProximity[top]+g.wallProximity[bottom])*.5;
      const speed=Math.abs(g.v[i]);
      g.v[i]/=1+dt*(AIR.wallDrag*near+AIR.wallDragQuadratic*near*speed);
    }
  }
}
