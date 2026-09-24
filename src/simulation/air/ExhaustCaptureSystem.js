import { AIR } from './AirConstants.js';

export class ExhaustCaptureSystem {
  constructor(grid){this.grid=grid;}

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
    const cells=[],r=e.captureRadius,d=e.direction;
    for(let dy=-Math.ceil(r);dy<=r;dy++)for(let dx=-Math.ceil(r);dx<=r;dx++){
      const distance=Math.hypot(dx,dy),x=e.x+dx,y=e.y+dy;
      if(distance>r||dx*d.x+dy*d.y>0||!this.visible(x,y,e.x,e.y))continue;
      cells.push({x,y,dx,dy,distance,weight:1/(1+distance*1.25)});
    }
    return cells;
  }

  isExhaustConnectedToOutside(e){
    const g=this.grid,d=e.direction,w=g.world;
    if(!g.isAir(e.x,e.y))return false;
    this.updateExterior();
    for(let step=1;step<=2;step++){
      const x=e.x+d.x*step,y=e.y+d.y*step;
      if(!g.inCell(x,y))return true;
      if(!g.isAir(x,y))return false;
      // Campaign openings are explicit; both the opening and its exterior side
      // must remain unobstructed and the discharge must point out of the room.
      for(const room of w.airRooms||[]){
        const inside=(px,py)=>px>room.x&&py>room.y&&px<room.x+room.w-1&&py<room.y+room.h-1;
        const beyond=(px,py)=>px<room.x||py<room.y||px>room.x+room.w-1||py>room.y+room.h-1;
        if(inside(e.x-d.x,e.y-d.y)&&beyond(x+d.x,y+d.y)&&g.isAir(x+d.x,y+d.y)&&this.exterior[g.cellIndex(x+d.x,y+d.y)])return true;
      }
    }
    return false;
  }

  updateExterior(){
    const g=this.grid;
    if(this.exteriorVersion===g.topologyVersion)return;
    this.exteriorVersion=g.topologyVersion;this.exterior=new Uint8Array(g.size);
    const rooms=g.world.airRooms||[],queue=[];
    const add=(x,y)=>{
      if(!g.isAir(x,y))return;
      const i=g.cellIndex(x,y);if(this.exterior[i])return;
      if(rooms.some(r=>x>r.x&&y>r.y&&x<r.x+r.w-1&&y<r.y+r.h-1))return;
      this.exterior[i]=1;queue.push({x,y});
    };
    for(let x=0;x<g.width;x++){add(x,0);add(x,g.height-1);}
    for(let y=0;y<g.height;y++){add(0,y);add(g.width-1,y);}
    for(let head=0;head<queue.length;head++){
      const {x,y}=queue[head];add(x-1,y);add(x+1,y);add(x,y-1);add(x,y+1);
    }
  }

  apply(dt){
    const g=this.grid;
    for(const e of g.world.entitiesByType('exhaust')){
      if(!e.enabled)continue;
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
