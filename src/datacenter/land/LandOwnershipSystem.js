import { entityFootprintCells } from '../../entities/EntityFootprint.js';

const touches=(a,b)=>{
  const overlapY=Math.max(a.y,b.y)<Math.min(a.y+a.height,b.y+b.height);
  const overlapX=Math.max(a.x,b.x)<Math.min(a.x+a.width,b.x+b.width);
  return (overlapY&&(a.x+a.width===b.x||b.x+b.width===a.x))||
    (overlapX&&(a.y+a.height===b.y||b.y+b.height===a.y));
};

export class LandOwnershipSystem {
  constructor(world,definition,state){
    this.world=world;this.definition=definition||{initialArea:null,areas:[]};
    this.areas=new Map((this.definition.areas||[]).map(area=>[area.id,{...area}]));
    this.ownedIds=new Set(Array.isArray(state?.ownedLandAreas)?state.ownedLandAreas:[this.definition.initialArea].filter(Boolean));
    if(this.definition.initialArea)this.ownedIds.add(this.definition.initialArea);
    this.ownedMask=new Uint8Array(world.size);this.revision=0;this.rebuild();
  }

  rebuild(){
    this.ownedMask.fill(0);
    for(const id of this.ownedIds){
      const area=this.areas.get(id);if(!area)continue;
      const x0=Math.max(0,area.x),y0=Math.max(0,area.y),x1=Math.min(this.world.width,area.x+area.width),y1=Math.min(this.world.height,area.y+area.height);
      for(let y=y0;y<y1;y++)this.ownedMask.fill(1,y*this.world.width+x0,y*this.world.width+x1);
    }
    this.revision++;this.world.landTopologyVersion=(this.world.landTopologyVersion||0)+1;
    this.world.airTopologyVersion++;this.world.thermalStatisticsVersion=(this.world.thermalStatisticsVersion||0)+1;
    this.world.navigationTopologyVersion++;
    return this;
  }

  isOwned(x,y){return this.world.inBounds(x,y)&&this.ownedMask[y*this.world.width+x]===1;}
  canBuildAt(x,y){return this.isOwned(x,y);}
  ownsFootprint(cells){return Array.isArray(cells)&&cells.length>0&&cells.every(cell=>this.isOwned(cell.x,cell.y));}
  areaAt(x,y){for(const area of this.areas.values())if(x>=area.x&&y>=area.y&&x<area.x+area.width&&y<area.y+area.height)return area;return null;}
  unlockArea(areaId){
    const area=this.areas.get(areaId);if(!area||this.ownedIds.has(areaId))return {ok:false,reason:'AREA_UNAVAILABLE'};
    if(![...this.ownedIds].some(id=>{const owned=this.areas.get(id);return owned&&touches(area,owned);}))return {ok:false,reason:'AREA_NOT_ADJACENT'};
    this.ownedIds.add(areaId);this.rebuild();return {ok:true,area};
  }
  isAreaOwned(id){return this.ownedIds.has(id);}
  areaForCells(cells){return this.areasForCells(cells);}
  areasForCells(cells){return [...this.areas.values()].filter(area=>cells.some(cell=>cell.x>=area.x&&cell.y>=area.y&&cell.x<area.x+area.width&&cell.y<area.y+area.height));}
  availableExpansions(){
    return [...this.areas.values()].filter(area=>!this.ownedIds.has(area.id)).map(area=>({
      ...area,available:[...this.ownedIds].some(id=>{const owned=this.areas.get(id);return owned&&touches(area,owned);}),
    }));
  }
  ownedTileCount(){let count=0;for(const value of this.ownedMask)count+=value;return count;}
  lockedTileCount(){return this.world.size-this.ownedTileCount();}
  ownedAreaIds(){return [...this.ownedIds].filter(id=>this.areas.has(id));}
  bounds({margin=0}={}){
    const owned=[...this.ownedIds].map(id=>this.areas.get(id)).filter(Boolean);if(!owned.length)return {x:0,y:0,width:0,height:0};
    const left=Math.min(...owned.map(area=>area.x)),top=Math.min(...owned.map(area=>area.y));
    const right=Math.max(...owned.map(area=>area.x+area.width)),bottom=Math.max(...owned.map(area=>area.y+area.height));
    return {x:Math.max(0,left-margin),y:Math.max(0,top-margin),width:Math.min(this.world.width,right+margin)-Math.max(0,left-margin),height:Math.min(this.world.height,bottom+margin)-Math.max(0,top-margin)};
  }
  occupiedTileCount(placedMaterials=[]){
    const occupied=new Set(),add=(x,y)=>{if(this.isOwned(x,y))occupied.add(y*this.world.width+x);};
    for(const entity of this.world.entities)if(!entity.isTechnician)for(const cell of entityFootprintCells(entity))add(cell.x,cell.y);
    for(const item of placedMaterials){const x=item.x,y=item.y;if(Number.isInteger(x)&&Number.isInteger(y))add(x,y);}
    if(!placedMaterials.length)for(let i=0;i<this.world.size;i++)if(this.ownedMask[i]&&!this.world.isAirIndex(i))occupied.add(i);
    return occupied.size;
  }
  statistics({placedMaterials=[],investment=0}={}){
    const owned=this.ownedTileCount(),occupied=this.occupiedTileCount(placedMaterials),racks=this.world.entities.filter(entity=>['serverRack','computeRack'].includes(entity.type)).length;
    return {ownedTiles:owned,occupiedTiles:occupied,freeTiles:Math.max(0,owned-occupied),rackDensity:owned?racks/owned*100:0,investment:Math.max(0,Number(investment)||0)};
  }
  migrate(state,snapshot,{legacyWidth=112}={}){
    if(Array.isArray(state.ownedLandAreas)){
      this.ownedIds=new Set(state.ownedLandAreas.filter(id=>this.areas.has(id)));
      if(this.definition.initialArea)this.ownedIds.add(this.definition.initialArea);
    }else{
      this.ownedIds=new Set([this.definition.initialArea].filter(Boolean));
      const acquire=(x,y)=>{const area=this.areaAt(x,y);if(area)this.ownedIds.add(area.id);};
      for(const entity of this.world.entities)if(!entity.isTechnician)for(const cell of entityFootprintCells(entity))acquire(cell.x,cell.y);
      for(const utility of this.world.allUtilities())acquire(utility.x,utility.y);
      const buildWidth=Number(snapshot?.world?.width)||legacyWidth;
      for(const item of snapshot?.build?.placedMaterials||[]){
        const index=Number(item.index);if(!Number.isInteger(index)||index<0)continue;
        acquire(index%buildWidth,Math.floor(index/buildWidth));
      }
      state.landInvestmentTotal=0;
    }
    state.landRevision=1;state.ownedLandAreas=[...this.ownedIds];
    this.rebuild();return state.ownedLandAreas;
  }
}
