export class NavigationGrid {
  constructor(world){
    this.world=world;this.walkable=new Uint8Array(world.size);this.technicianOccupancy=new Int32Array(world.size);
    this.technicianOccupancy.fill(-1);this.sourceVersion=-1;this.version=0;this.rebuildCount=0;
    world.navigationGrid=this;this.rebuild();
    for(const worker of world.entitySetByType?.('technician')||world.entitiesByType?.('technician')||[])this.addTechnician(worker);
  }

  ensureCurrent(){
    if(this.sourceVersion===(this.world.navigationTopologyVersion||0))return false;
    this.rebuild();return true;
  }

  rebuild(){
    const world=this.world;
    for(let index=0;index<world.size;index++)this.walkable[index]=world.isAirIndex(index)&&!world.entityAt(index%world.width,Math.floor(index/world.width))?1:0;
    this.sourceVersion=world.navigationTopologyVersion||0;this.version++;this.rebuildCount++;
  }

  addTechnician(worker){
    const index=this.world.inBounds(worker.x,worker.y)?this.world.index(worker.x,worker.y):-1;
    if(index>=0)this.technicianOccupancy[index]=worker.id;
  }

  removeTechnician(worker,x=worker.x,y=worker.y){
    if(!this.world.inBounds(x,y))return;
    const index=this.world.index(x,y);if(this.technicianOccupancy[index]===worker.id)this.technicianOccupancy[index]=-1;
  }

  moveTechnician(worker,x,y){
    this.removeTechnician(worker);if(this.world.inBounds(x,y))this.technicianOccupancy[this.world.index(x,y)]=worker.id;
  }

  isWalkable(x,y,worker=null){
    this.ensureCurrent();if(!this.world.inBounds(x,y))return false;
    const index=this.world.index(x,y),occupant=this.technicianOccupancy[index];
    return this.walkable[index]===1&&(occupant===-1||occupant===worker?.id);
  }

  isWalkableIndex(index,worker=null){
    this.ensureCurrent();if(index<0||index>=this.world.size)return false;
    const occupant=this.technicianOccupancy[index];
    return this.walkable[index]===1&&(occupant===-1||occupant===worker?.id);
  }
}
