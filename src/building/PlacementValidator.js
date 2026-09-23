const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger']);
const FLUID_TOOLS=new Set(['pipe','pump','tank','radiator','exchanger']);
import { HVACPortResolver } from '../simulation/hvac/ports/HVACPortResolver.js';
export const DUCT_TOOLS=new Set(['smallDuct','mediumDuct','largeDuct']);
export const HVAC_PATH_TOOLS=new Set([...DUCT_TOOLS,'refrigerantLine']);
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

export class PlacementValidator {
  constructor(world){this.world=world;this.hvacPorts=new HVACPortResolver();}

  fluidEntityAt(x,y,additionalEntities=[]){
    const entity=this.world.entityAt(x,y)||additionalEntities.find(candidate=>candidate.x===x&&candidate.y===y);
    return entity&&FLUID_TYPES.has(entity.type)?entity:null;
  }

  fluidNeighbors(x,y,additionalEntities=[]){
    return DIRS.map(([dx,dy])=>this.fluidEntityAt(x+dx,y+dy,additionalEntities)).filter(Boolean);
  }

  isHVACPortCell(x,y){
    for(const entity of this.world.entities){
      if(entity.type==='airHandler'&&this.hvacPorts.airHandler(entity).some(port=>port.cell.x===x&&port.cell.y===y))return true;
      if(entity.type==='condenser'){
        const port=this.hvacPorts.condenser(entity).cell;if(port.x===x&&port.y===y)return true;
      }
    }
    return false;
  }

  canPlace(tool,x,y,{additionalEntities=[],additionalUtilities=[]}={}){
    const w=this.world;if(!w.inBounds(x,y))return false;
    if(tool==='demolish')return Boolean(w.entityAt(x,y))||Boolean(w.utilityAt(x,y))||!w.isAir(x,y);
    if(['wall','insulation','copper'].includes(tool))return w.isAir(x,y)&&!w.entityAt(x,y);
    if(DUCT_TOOLS.has(tool)){
      if(w.utilitiesAt(x,y).some(item=>DUCT_TOOLS.has(item.type))||additionalUtilities.some(item=>DUCT_TOOLS.has(item.type)&&item.x===x&&item.y===y)||w.entityAt(x,y))return false;
      for(const [dx,dy] of DIRS){
        const entity=w.entityAt(x+dx,y+dy);if(!entity)continue;
        if(entity.type==='condenser')return false;
        if(entity.type==='airHandler'&&!['supply','return'].some(service=>this.hvacPorts.portForCell(entity,x,y,service)))return false;
      }
      return true;
    }
    if(tool==='refrigerantLine'){
      if(w.utilitiesAt(x,y).some(item=>item.type==='refrigerantLine')||additionalUtilities.some(item=>item.type==='refrigerantLine'&&item.x===x&&item.y===y)||w.entityAt(x,y))return false;
      for(const [dx,dy] of DIRS){
        const entity=w.entityAt(x+dx,y+dy);if(!entity)continue;
        if(['supplyVent','returnVent'].includes(entity.type))return false;
        if(['airHandler','condenser'].includes(entity.type)&&!this.hvacPorts.portForCell(entity,x,y,'refrigerant'))return false;
      }
      return true;
    }
    if(tool==='damper')return Boolean((w.utilitiesAt(x,y).some(item=>DUCT_TOOLS.has(item.type))||additionalUtilities.some(item=>DUCT_TOOLS.has(item.type)&&item.x===x&&item.y===y))&&!w.utilityAt(x,y,'ductDamper')&&!additionalUtilities.some(item=>item.type==='ductDamper'&&item.x===x&&item.y===y));
    if(['supplyVent','returnVent'].includes(tool)&&this.isHVACPortCell(x,y))return false;
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
