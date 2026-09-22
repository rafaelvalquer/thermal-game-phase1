const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger']);
const FLUID_TOOLS=new Set(['pipe','pump','tank','radiator','exchanger']);
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

export class PlacementValidator {
  constructor(world){this.world=world;}

  fluidEntityAt(x,y){
    const entity=this.world.entityAt(x,y);
    return entity&&FLUID_TYPES.has(entity.type)?entity:null;
  }

  fluidNeighbors(x,y){
    return DIRS.map(([dx,dy])=>this.fluidEntityAt(x+dx,y+dy)).filter(Boolean);
  }

  canPlace(tool,x,y){
    const w=this.world;if(!w.inBounds(x,y))return false;
    if(tool==='demolish')return Boolean(w.entityAt(x,y))||!w.isAir(x,y);
    if(['wall','insulation','copper'].includes(tool))return w.isAir(x,y)&&!w.entityAt(x,y);
    if(!w.isAir(x,y)||w.entityAt(x,y))return false;

    if(FLUID_TOOLS.has(tool)){
      const neighbors=this.fluidNeighbors(x,y);
      if(neighbors.length>2)return false;
      for(const neighbor of neighbors){
        if(this.fluidNeighbors(neighbor.x,neighbor.y).length>=2)return false;
      }
    }
    return true;
  }
}
