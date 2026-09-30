const CARDINALS=[[1,0],[-1,0],[0,1],[0,-1]];
const keyOf=(x,y)=>`${x},${y}`;

export class FluidAirStencilCache {
  constructor(world){this.world=world;this.topologyVersion=-1;this.entries=new Map();this.buildCount=0;}

  syncTopology(){
    const version=this.world.airTopologyVersion??0;
    if(version===this.topologyVersion)return;
    this.entries.clear();this.topologyVersion=version;
  }

  exchangerCells(exchanger){
    return this.get(exchanger,'exchanger',()=>this.buildExchangerCells(exchanger));
  }

  radiatorStencil(radiator){
    return this.get(radiator,'radiator',()=>this.buildRadiatorStencil(radiator));
  }

  get(entity,kind,build){
    this.syncTopology();
    const id=entity.id??entity;
    const cached=this.entries.get(id);
    if(cached?.kind===kind&&cached.x===entity.x&&cached.y===entity.y)return cached.value;
    const value=build();this.entries.set(id,{kind,x:entity.x,y:entity.y,value});this.buildCount++;
    return value;
  }

  buildExchangerCells(exchanger){
    const world=this.world;
    if(!world.isAir(exchanger.x,exchanger.y))return [];
    const queue=[{x:exchanger.x,y:exchanger.y,distance:0}],seen=new Set([keyOf(exchanger.x,exchanger.y)]),cells=[];
    for(let head=0;head<queue.length;head++){
      const {x,y,distance}=queue[head];cells.push({index:world.index(x,y),weight:1/(1+distance)});
      if(distance>=2)continue;
      for(const [dx,dy] of CARDINALS){
        const nx=x+dx,ny=y+dy,key=keyOf(nx,ny);
        if(seen.has(key)||!world.inBounds(nx,ny)||!world.isAir(nx,ny))continue;
        seen.add(key);queue.push({x:nx,y:ny,distance:distance+1});
      }
    }
    return cells;
  }

  buildRadiatorStencil(radiator){
    const world=this.world,cells=[],queue=[{x:radiator.x,y:radiator.y}],seen=new Set([keyOf(radiator.x,radiator.y)]);let weightSum=0;
    for(let head=0;head<queue.length;head++){
      const {x,y}=queue[head],dx=x-radiator.x,dy=y-radiator.y,distance=Math.abs(dx)+Math.abs(dy);
      if(!world.inBounds(x,y)||!world.isAir(x,y))continue;
      const weight=distance===0?4:distance===1?2:1;cells.push({x,y,index:world.index(x,y),weight});weightSum+=weight;
      if(distance>=2)continue;
      for(const [ox,oy] of CARDINALS){const nx=x+ox,ny=y+oy,key=keyOf(nx,ny);if(seen.has(key)||Math.abs(nx-radiator.x)>1||Math.abs(ny-radiator.y)>1||!world.inBounds(nx,ny)||!world.isAir(nx,ny))continue;seen.add(key);queue.push({x:nx,y:ny});}
    }
    return {cells,weightSum};
  }
}
