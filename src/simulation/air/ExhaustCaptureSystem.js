import { isPowered } from '../PowerState.js';
import { AIR } from './AirConstants.js';

export class ExhaustCaptureSystem {
  constructor(grid){this.grid=grid;this.cellCache=new WeakMap();}

  // Supercover sampling also checks both sides of a corner.
  visible(x,y,tx,ty){
    const g=this.grid,steps=Math.ceil(Math.hypot(tx-x,ty-y)*4);
    let px=x,py=y;
    for(let i=0;i<=steps;i++){
      const nx=Math.round(x+(tx-x)*i/Math.max(1,steps)),ny=Math.round(y+(ty-y)*i/Math.max(1,steps));
      if(!g.isAir(nx,ny)||!g.isAir(px,ny)||!g.isAir(nx,py))return false;
      px=nx;py=ny;
    }
    return true;
  }

  cells(e){
    const signature=[this.grid.topologyVersion,this.grid.world.airTopologyVersion,e.x,e.y,e.direction.x,e.direction.y,e.captureRadius].join(':');
    const cached=this.cellCache.get(e);if(cached?.signature===signature)return cached.cells;
    const cells=[],r=e.captureRadius,d=e.direction;
    for(let dy=-Math.ceil(r);dy<=r;dy++)for(let dx=-Math.ceil(r);dx<=r;dx++){
      const x=e.x+dx,y=e.y+dy,depth=-(dx*d.x+dy*d.y),lateral=Math.abs(dx*d.y-dy*d.x);
      if(depth<0||depth>r||lateral>.35+depth*.65||!this.visible(x,y,e.x,e.y))continue;
      const distance=Math.hypot(depth,lateral);
      cells.push({x,y,dx,dy,depth,lateral,distance,weight:(1/(1+distance*1.1))*(.8+.2*depth/Math.max(r,1))});
    }
    this.cellCache.set(e,{signature,cells});return cells;
  }

  isExhaustConnectedToOutside(e){
    // Exhaust fans have an implicit discharge duct to the building exterior.
    // Walls still constrain the captured intake area, but do not obstruct this
    // off-map outlet path.
    return this.grid.isAir(e.x,e.y);
  }

  updateExterior(){
    const environment=this.grid.world.environmentTopology;
    if(!environment){this.exterior=this.grid.exteriorCells;this.exteriorVersion=this.grid.topologyVersion;return;}
    environment.ensureCurrent();this.exterior=environment.exteriorMask;this.exteriorVersion=environment.revision;
  }

  apply(dt){
    const g=this.grid;
    for(const e of g.world.entitiesByType('exhaust')){
      if(!isPowered(e))continue;
      for(const c of this.cells(e)){
        if(!c.distance)continue;
        const impulse=e.captureStrength*c.weight*dt;
        const vx=-c.dx/c.distance*impulse,vy=-c.dy/c.distance*impulse;
        for(const x of [c.x,c.x+1])if(!g.blockedU(x,c.y))g.u[g.uIndex(x,c.y)]=Math.max(-AIR.maxVelocity,Math.min(AIR.maxVelocity,g.u[g.uIndex(x,c.y)]+vx));
        for(const y of [c.y,c.y+1])if(!g.blockedV(c.x,y))g.v[g.vIndex(c.x,y)]=Math.max(-AIR.maxVelocity,Math.min(AIR.maxVelocity,g.v[g.vIndex(c.x,y)]+vy));
      }
    }
  }
}
