const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
const EMPTY_POINTS=[];

export class PatrolGraph {
  constructor(world,navigation){this.world=world;this.navigation=navigation;this.sourceVersion=-1;this.componentId=new Int32Array(world.size);this.componentCount=0;this.pointsByComponent=new Map();this.rebuildCount=0;}

  ensureCurrent(){
    this.navigation.ensureCurrent();if(this.sourceVersion===this.navigation.version)return false;
    const world=this.world,walkable=this.navigation.walkable;this.sourceVersion=this.navigation.version;this.componentId.fill(-1);this.componentCount=0;
    const queue=new Int32Array(world.size);
    for(let start=0;start<world.size;start++){
      if(!walkable[start]||this.componentId[start]>=0)continue;
      const id=this.componentCount++;let head=0,tail=0;queue[tail++]=start;this.componentId[start]=id;
      while(head<tail){const index=queue[head++],x=index%world.width,y=(index/world.width)|0;
        for(const [dx,dy] of DIRECTIONS){const nx=x+dx,ny=y+dy;if(!world.inBounds(nx,ny))continue;const next=world.index(nx,ny);if(!walkable[next]||this.componentId[next]>=0)continue;this.componentId[next]=id;queue[tail++]=next;}
      }
    }
    this.pointsByComponent.clear();const pointIndices=new Set();
    for(const rack of world.entitySetByType?.('serverRack')||world.entitiesByType('serverRack'))for(const [dx,dy] of DIRECTIONS){
      const x=rack.x+dx,y=rack.y+dy;if(!world.inBounds(x,y))continue;const index=world.index(x,y),id=this.componentId[index];if(id<0||pointIndices.has(index))continue;pointIndices.add(index);
      let points=this.pointsByComponent.get(id);if(!points)this.pointsByComponent.set(id,points=[]);
      points.push({x,y});
    }
    for(const points of this.pointsByComponent.values())points.sort((a,b)=>a.y-b.y||a.x-b.x);
    this.rebuildCount++;return true;
  }

  componentAt(x,y){if(!this.world.inBounds(x,y))return -1;return this.componentId[this.world.index(x,y)];}
  pointsAt(x,y){return this.pointsByComponent.get(this.componentAt(x,y))||EMPTY_POINTS;}
}
