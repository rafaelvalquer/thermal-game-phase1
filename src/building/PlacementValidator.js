import { entityFootprintCells } from '../entities/EntityFootprint.js';
const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger','waterChiller']);
const FLUID_TOOLS=new Set(['pipe','pump','tank','radiator','exchanger','waterChiller']);
const COOLING_TOOLS=new Set(['coolingUnit','industrialCoolingUnit']);
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

  adjacentCoolingDuctComponents(x,y,footprint=[{x,y}]){
    const w=this.world,ducts=w.allUtilities().filter(item=>DUCT_TOOLS.has(item.type)),at=new Map(ducts.map(d=>[`${d.x},${d.y}`,d])),seen=new Set(),components=[];
    for(const cell of footprint)for(const [dx,dy] of DIRS){
      const sx=cell.x+dx,sy=cell.y+dy,start=at.get(`${sx},${sy}`);if(!start)continue;
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

  canPlace(tool,x,y,{additionalEntities=[],additionalUtilities=[],direction={x:1,y:0},footprintLength=1}={}){
    return this.validatePlacement(tool,x,y,{additionalEntities,additionalUtilities,direction,footprintLength}).ok;
  }

  validatePlacement(tool,x,y,{additionalEntities=[],additionalUtilities=[],direction={x:1,y:0},footprintLength=1}={}){
    const w=this.world,fail=reason=>({ok:false,reason});if(!w.inBounds(x,y))return fail('OUT_OF_BOUNDS');
    const footprint=COOLING_TOOLS.has(tool)?entityFootprintCells({type:'coolingUnit',x,y,direction,footprintLength}):[{x,y}];
    if(footprint.some(cell=>!w.inBounds(cell.x,cell.y)))return fail('OUT_OF_BOUNDS');
    if(tool!=='demolish'&&w.landOwnership&&!w.landOwnership.ownsFootprint(footprint))return fail('LAND_LOCKED');
    if(!this.canPlacePhysical(tool,x,y,{additionalEntities,additionalUtilities,direction,footprintLength})){
      const entity=footprint.some(cell=>w.entityAt(cell.x,cell.y)||additionalEntities.some(e=>entityFootprintCells(e).some(item=>item.x===cell.x&&item.y===cell.y)));
      const utility=footprint.some(cell=>w.utilityAt(cell.x,cell.y)||additionalUtilities.some(item=>item.x===cell.x&&item.y===cell.y));
      const solid=footprint.some(cell=>!w.isAir(cell.x,cell.y));
      return fail(entity?'OCCUPIED':utility?'UTILITY_CONFLICT':solid?'OCCUPIED':'INVALID_CONNECTION');
    }
    return {ok:true,reason:null};
  }

  canPlacePhysical(tool,x,y,{additionalEntities=[],additionalUtilities=[],direction={x:1,y:0},footprintLength=1}={}){
    const w=this.world;if(!w.inBounds(x,y))return false;
    if(tool==='demolish')return Boolean(w.entityAt(x,y))||Boolean(w.utilityAt(x,y))||!w.isAir(x,y);
    if(['wall','insulation','copper'].includes(tool)){
      const entity=w.entityAt(x,y);
      return w.isAir(x,y)&&(!entity||tool==='wall'&&entity.type==='pipe');
    }
    if(DUCT_TOOLS.has(tool)){
      const entity=w.entityAt(x,y);
      if(w.utilitiesAt(x,y).some(item=>DUCT_TOOLS.has(item.type))||additionalUtilities.some(item=>DUCT_TOOLS.has(item.type)&&item.x===x&&item.y===y)||(entity&&entity.type!=='pipe'))return false;
      return true;
    }
    if(COOLING_TOOLS.has(tool)){
      const candidate={type:'coolingUnit',x,y,direction,footprintLength},cells=entityFootprintCells(candidate);
      if(cells.some(cell=>!w.inBounds(cell.x,cell.y)||!w.isAir(cell.x,cell.y)||w.entityAt(cell.x,cell.y)||additionalEntities.some(e=>entityFootprintCells(e).some(occupied=>occupied.x===cell.x&&occupied.y===cell.y))||w.utilityAt(cell.x,cell.y)))return false;
      return this.adjacentCoolingDuctComponents(x,y,cells).length<=1;
    }
    if(tool==='solarPanel')return w.isAir(x,y)&&!w.entityAt(x,y)&&!w.utilityAt(x,y);
    if(tool==='serverRack'||tool.startsWith('computeRack')){
      if(tool.startsWith('computeRack')&&!w.datacenterConfig)return false;
      const hall=w.datacenterConfig?.serverHall;
      const inHall=w.datacenterConfig?.land||!hall||(x>=hall.x&&y>=hall.y&&x<hall.x+hall.width&&y<hall.y+hall.height);
      return inHall&&w.isAir(x,y)&&!w.entityAt(x,y)&&!w.utilityAt(x,y);
    }
    if(tool==='supplyVent'&&w.thermalSystems?.simpleCooling&&this.adjacentCoolingDuctComponents(x,y).length>1)return false;
    if(['coolingUnit','industrialCoolingUnit','supplyVent'].includes(tool))return w.isAir(x,y)&&!w.entityAt(x,y)&&!w.utilityAt(x,y);
    const occupiedEntity=w.entityAt(x,y);
    if(occupiedEntity)return false;
    if(tool!=='pipe'&&!w.isAir(x,y))return false;

    if(FLUID_TOOLS.has(tool)){
      const neighbors=this.fluidNeighbors(x,y,additionalEntities);
      const candidateLimit=tool==='pipe'?3:2;
      if(neighbors.length>candidateLimit)return false;
      for(const neighbor of neighbors){
        const limit=neighbor.type==='pipe'?3:2;
        if(this.fluidNeighbors(neighbor.x,neighbor.y,additionalEntities).length>=limit)return false;
      }
    }
    return true;
  }
}
