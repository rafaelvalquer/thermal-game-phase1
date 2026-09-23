import { HVAC_PATH_TOOLS } from './PlacementValidator.js';

export class UtilityPlacementSystem {
  constructor(world,validator){this.world=world;this.validator=validator;}
  planPath(tool,path,{inventory=Infinity,budget=Infinity,cost=0}={}){
    const seen=new Set(),additionalUtilities=[],entries=[];let remaining=inventory,remainingBudget=budget;
    for(const point of path){
      const key=`${point.x},${point.y}`;if(seen.has(key))continue;seen.add(key);
      const hasResources=remaining>0&&remainingBudget>=cost;
      const valid=HVAC_PATH_TOOLS.has(tool)&&hasResources&&this.validator.canPlace(tool,point.x,point.y,{additionalUtilities});
      entries.push({...point,valid,embedded:valid&&!this.world.isAir(point.x,point.y)});
      if(valid){additionalUtilities.push({id:`planned-utility-${key}`,type:tool,x:point.x,y:point.y});remaining--;remainingBudget-=cost;}
    }
    return {entries,placed:entries.filter(item=>item.valid).length,failed:entries.filter(item=>!item.valid).length};
  }
}
