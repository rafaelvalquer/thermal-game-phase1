const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger']);
const FLUID_TOOLS=new Set(['pipe','pump','tank','radiator','exchanger']);
export const DUCT_TOOLS=new Set(['duct']);
export const DUCT_PATH_TOOLS=DUCT_TOOLS;
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

  wouldJoinCoolingUnits(x,y,additionalUtilities=[]){
    const w=this.world,ducts=[...w.allUtilities().filter(item=>DUCT_TOOLS.has(item.type)),...additionalUtilities.filter(item=>DUCT_TOOLS.has(item.type)),{type:'duct',x,y}];
    const at=new Map(ducts.map(d=>[`${d.x},${d.y}`,d])),start=`${x},${y}`,queue=[at.get(start)],seen=new Set([start]),units=new Set();
    while(queue.length){
      const duct=queue.shift();
      for(const [dx,dy] of DIRS){
        const nx=duct.x+dx,ny=duct.y+dy,key=`${nx},${ny}`,entity=w.entityAt(nx,ny);
        if(entity?.type==='coolingUnit')units.add(entity.id);
        const neighbor=at.get(key);if(neighbor&&!seen.has(key)){seen.add(key);queue.push(neighbor);}
      }
    }
    return units.size>1;
  }

  adjacentCoolingDuctComponents(x,y){
    const w=this.world,ducts=w.allUtilities().filter(item=>DUCT_TOOLS.has(item.type)),at=new Map(ducts.map(d=>[`${d.x},${d.y}`,d])),seen=new Set(),components=[];
    for(const [dx,dy] of DIRS){
      const sx=x+dx,sy=y+dy,start=at.get(`${sx},${sy}`);if(!start)continue;
      const key=`${sx},${sy}`;if(seen.has(key))continue;
      const queue=[start],component=[];seen.add(key);
      for(let head=0;head<queue.length;head++){
        const duct=queue[head];component.push(duct);
        for(const [ox,oy] of DIRS){const nx=duct.x+ox,ny=duct.y+oy,nkey=`${nx},${ny}`,next=at.get(nkey);if(next&&!seen.has(nkey)){seen.add(nkey);queue.push(next);}}
      }
      components.push(component);
    }
    return components;
  }

  wouldPlaceUnitOnOwnedNetwork(x,y){
    return this.adjacentCoolingDuctComponents(x,y).some(component=>{
      const ids=new Set(component.map(duct=>`${duct.x},${duct.y}`));
      return this.world.entities.some(entity=>entity.type==='coolingUnit'&&DIRS.some(([dx,dy])=>ids.has(`${entity.x+dx},${entity.y+dy}`)));
    });
  }

  canPlace(tool,x,y,{additionalEntities=[],additionalUtilities=[]}={}){
    const w=this.world;if(!w.inBounds(x,y))return false;
    if(tool==='demolish')return Boolean(w.entityAt(x,y))||Boolean(w.utilityAt(x,y))||!w.isAir(x,y);
    if(['wall','insulation','copper'].includes(tool))return w.isAir(x,y)&&!w.entityAt(x,y);
    if(DUCT_TOOLS.has(tool)){
      if(w.utilitiesAt(x,y).some(item=>DUCT_TOOLS.has(item.type))||additionalUtilities.some(item=>DUCT_TOOLS.has(item.type)&&item.x===x&&item.y===y)||w.entityAt(x,y))return false;
      if(this.wouldJoinCoolingUnits(x,y,additionalUtilities))return false;
      return true;
    }
    if(tool==='coolingUnit')return w.isAir(x,y)&&!w.entityAt(x,y)&&!w.utilityAt(x,y)&&this.adjacentCoolingDuctComponents(x,y).length<=1&&!this.wouldPlaceUnitOnOwnedNetwork(x,y);
    if(tool==='serverRack'){
      const hall=w.datacenterConfig?.serverHall;
      const inHall=!hall||(x>=hall.x&&y>=hall.y&&x<hall.x+hall.width&&y<hall.y+hall.height);
      return inHall&&w.isAir(x,y)&&!w.entityAt(x,y)&&!w.utilityAt(x,y);
    }
    if(tool==='supplyVent'&&w.thermalSystems?.simpleCooling&&this.adjacentCoolingDuctComponents(x,y).length>1)return false;
    if(tool==='supplyVent'&&w.thermalSystems?.simpleCooling&&this.adjacentCoolingDuctComponents(x,y).length>1)return false;
    if(['coolingUnit','supplyVent'].includes(tool))return w.isAir(x,y)&&!w.entityAt(x,y)&&!w.utilityAt(x,y);
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
