const DIRECTIONS=[[1,0],[0,1],[-1,0],[0,-1]];

export class TechnicianPathfinder {
  constructor(world,navigation,{maxCachedPaths=192,monitor=null}={}){
    this.world=world;this.navigation=navigation;this.maxCachedPaths=maxCachedPaths;this.monitor=monitor;
    this.queue=new Int32Array(world.size);this.previous=new Int32Array(world.size);this.visited=new Uint32Array(world.size);this.searchId=0;
    this.pathCache=new Map();this.calculations=0;this.cacheHits=0;this.cellsVisited=0;
  }

  findPath(sx,sy,gx,gy,worker=null){
    const world=this.world,navigation=this.navigation;navigation.ensureCurrent();
    if(!world.inBounds(sx,sy)||!navigation.isWalkable(gx,gy,worker))return null;
    const start=world.index(sx,sy),goal=world.index(gx,gy);
    if(start===goal)return [];
    const key=`${start}:${goal}:${navigation.version}`,cached=this.pathCache.get(key);
    if(cached&&cached.every(index=>navigation.isWalkableIndex(index,worker))){
      this.pathCache.delete(key);this.pathCache.set(key,cached);this.cacheHits++;this.monitor?.count?.('technicianPathCacheHitCount');
      return cached.map(index=>({x:index%world.width,y:Math.floor(index/world.width)}));
    }

    this.calculations++;this.monitor?.count?.('technicianPathCalculationCount');this.monitor?.count?.('pathsCalculated');this.monitor?.begin?.('technicianPathfindingMs');
    let result=null;
    try{
      const id=++this.searchId;let head=0,tail=0;this.queue[tail++]=start;this.visited[start]=id;this.previous[start]=-1;
      while(head<tail){
        const current=this.queue[head++];this.cellsVisited++;
        if(current===goal)break;
        const x=current%world.width,y=Math.floor(current/world.width);
        for(const [dx,dy] of DIRECTIONS){const nx=x+dx,ny=y+dy;if(!world.inBounds(nx,ny))continue;const next=world.index(nx,ny);
          if(this.visited[next]===id||!navigation.isWalkableIndex(next,worker))continue;
          this.visited[next]=id;this.previous[next]=current;this.queue[tail++]=next;
        }
      }
      if(this.visited[goal]!==id)return null;
      const path=[];for(let current=goal;current!==start;current=this.previous[current])path.push(current);path.reverse();
      this.store(key,path);
      result=path.map(index=>({x:index%world.width,y:Math.floor(index/world.width)}));return result;
    }finally{this.monitor?.end?.('technicianPathfindingMs');}
  }

  store(key,path){
    if(this.pathCache.has(key))this.pathCache.delete(key);
    this.pathCache.set(key,path);
    while(this.pathCache.size>this.maxCachedPaths)this.pathCache.delete(this.pathCache.keys().next().value);
  }
}
