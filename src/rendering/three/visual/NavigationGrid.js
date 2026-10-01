import { entityFootprintCells } from '../../../entities/EntityFootprint.js';

export class NavigationGrid {
  constructor(world,{land=world?.landOwnership,extraBlocked=[]}={}){
    this.width=world?.width||0;this.height=world?.height||0;this.blocked=new Uint8Array(this.width*this.height);
    for(let i=0;i<this.blocked.length;i++)if(!world.isAirIndex(i))this.blocked[i]=1;
    for(const entity of world?.entities||[]){
      if(entity.isTechnician)continue;
      const cells=entityFootprintCells(entity);
      const isCollidable=['serverRack','computeRack','coolingUnit','fan','exhaust','pump','tank','radiator','exchanger','waterChiller','furnace','machine','battery'].includes(entity.type);
      if(!isCollidable)continue;
      for(const cell of cells)this.block(cell.x,cell.y);
    }
    for(const cell of extraBlocked)this.block(cell.x,cell.y);
    this.land=land||null;
  }
  block(x,y){if(this.inBounds(x,y))this.blocked[y*this.width+x]=1;}
  inBounds(x,y){return x>=0&&y>=0&&x<this.width&&y<this.height;}
  isWalkable(x,y){return this.inBounds(x,y)&&!this.blocked[y*this.width+x]&&(!this.land?.isOwned||this.land.isOwned(x,y));}
  canOccupy(x,z,radius=.2){
    const minX=Math.floor(x-radius),maxX=Math.floor(x+radius),minY=Math.floor(z-radius),maxY=Math.floor(z+radius);
    for(let y=minY;y<=maxY;y++)for(let tx=minX;tx<=maxX;tx++)if(!this.isWalkable(tx,y))return false;
    return true;
  }
}
