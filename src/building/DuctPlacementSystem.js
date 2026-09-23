import { DUCT_TOOLS } from './PlacementValidator.js';

const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

export class DuctPlacementSystem {
  constructor(world,validator){this.world=world;this.validator=validator;}

  roleAt(x,y){
    for(const [dx,dy] of DIRS){
      const nx=x+dx,ny=y+dy;
      if(this.world.entityAt(nx,ny)?.type==='returnVent')return 'return';
      if(this.world.utilitiesAt(nx,ny).some(item=>DUCT_TOOLS.has(item.type)&&item.role==='return'))return 'return';
    }
    return 'supply';
  }

  roleForPath(path){
    const cells=new Set(path.map(({x,y})=>`${x},${y}`));
    for(const {x,y} of path)for(const [dx,dy] of DIRS){
      const nx=x+dx,ny=y+dy;if(cells.has(`${nx},${ny}`))continue;
      if(this.world.entityAt(nx,ny)?.type==='returnVent')return 'return';
      if(this.world.utilitiesAt(nx,ny).some(item=>DUCT_TOOLS.has(item.type)&&item.role==='return'))return 'return';
    }
    return 'supply';
  }

  planPath(tool,path,{inventory=Infinity,budget=Infinity,cost=0}={}){
    const role=this.roleForPath(path),seen=new Set(),additionalUtilities=[],entries=[];
    let remaining=inventory,remainingBudget=budget;
    for(const point of path){
      const key=`${point.x},${point.y}`;if(seen.has(key))continue;seen.add(key);
      const hasResources=remaining>0&&remainingBudget>=cost;
      const valid=DUCT_TOOLS.has(tool)&&hasResources&&this.validator.canPlace(tool,point.x,point.y,{additionalUtilities});
      entries.push({...point,role,valid});
      if(valid){
        additionalUtilities.push({id:`planned-duct-${key}`,type:tool,x:point.x,y:point.y,role});
        remaining--;remainingBudget-=cost;
      }
    }
    return {role,entries,placed:entries.filter(item=>item.valid).length,failed:entries.filter(item=>!item.valid).length};
  }
}
