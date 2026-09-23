const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger']);
const FLUID_TOOLS=new Set(['pipe','pump','tank','radiator','exchanger']);
export const DUCT_TOOLS=new Set(['smallDuct','mediumDuct','largeDuct']);
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

export class PlacementValidator {
  constructor(world){this.world=world;}

  fluidEntityAt(x,y,additionalEntities=[]){
    const entity=this.world.entityAt(x,y)||additionalEntities.find(candidate=>candidate.x===x&&candidate.y===y);
    return entity&&FLUID_TYPES.has(entity.type)?entity:null;
  }

  fluidNeighbors(x,y,additionalEntities=[]){
    return DIRS.map(([dx,dy])=>this.fluidEntityAt(x+dx,y+dy,additionalEntities)).filter(Boolean);
  }

  canPlace(tool,x,y,{additionalEntities=[],additionalUtilities=[]}={}){
    const w=this.world;if(!w.inBounds(x,y))return false;
    if(tool==='demolish')return Boolean(w.entityAt(x,y))||!w.isAir(x,y);
    if(['wall','insulation','copper'].includes(tool))return w.isAir(x,y)&&!w.entityAt(x,y);
    if(DUCT_TOOLS.has(tool))return !w.utilitiesAt(x,y).some(item=>DUCT_TOOLS.has(item.type))&&!additionalUtilities.some(item=>DUCT_TOOLS.has(item.type)&&item.x===x&&item.y===y)&&!w.entityAt(x,y);
    if(tool==='damper')return Boolean((w.utilityAt(x,y)||additionalUtilities.some(item=>DUCT_TOOLS.has(item.type)&&item.x===x&&item.y===y))&&!w.utilityAt(x,y,'ductDamper'));
    if(['airHandler','condenser','supplyVent','returnVent'].includes(tool))return w.isAir(x,y)&&!w.entityAt(x,y)&&!w.utilityAt(x,y);
    if(w.entityAt(x,y))return false;
    if(tool!=='pipe'&&!w.isAir(x,y))return false;

    if(FLUID_TOOLS.has(tool)){
      const neighbors=this.fluidNeighbors(x,y,additionalEntities);
      if(neighbors.length>2)return false;
      for(const neighbor of neighbors){
        if(this.fluidNeighbors(neighbor.x,neighbor.y,additionalEntities).length>=2)return false;
      }
    }
    return true;
  }
}
