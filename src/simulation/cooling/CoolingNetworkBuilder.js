import { CoolingNetwork } from './CoolingNetwork.js';

const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const isDuct=e=>e?.type==='duct';

export class CoolingNetworkBuilder {
  constructor(world){this.world=world;}
  build(){
    const world=this.world,ducts=world.allUtilities().filter(isDuct),vents=world.entitiesByType('supplyVent'),units=world.entitiesByType('coolingUnit');
    const at=new Map(ducts.map(d=>[world.index(d.x,d.y),d])),seen=new Set(),networks=[];
    for(const seed of ducts){
      const si=world.index(seed.x,seed.y);if(seen.has(si))continue;
      const component=[],queue=[seed];seen.add(si);
      for(let head=0;head<queue.length;head++){
        const d=queue[head];component.push(d);
        for(const [dx,dy] of DIRS){const n=world.inBounds(d.x+dx,d.y+dy)?at.get(world.index(d.x+dx,d.y+dy)):null;if(n&&!seen.has(world.index(n.x,n.y))){seen.add(world.index(n.x,n.y));queue.push(n);}}
      }
      const componentIds=new Set(component.map(d=>d.id));
      const connectedUnits=units.filter(unit=>this.adjacentDucts(unit,at).some(d=>componentIds.has(d.id)));
      const connectedVents=vents.filter(vent=>this.adjacentDucts(vent,at).some(d=>componentIds.has(d.id)));
      const owner=connectedUnits.length===1?connectedUnits[0]:null;
      const network=new CoolingNetwork({id:owner?`cooling-${owner.missionId||owner.id}`:`cooling-open-${component[0].id}`,sourceUnit:owner,sourceUnits:connectedUnits,ducts:component,vents:connectedVents,status:connectedUnits.length>1?'MULTIPLE COOLING UNITS':connectedUnits.length===0?'NO COOLING UNIT':connectedVents.length===0?'NO OUTLET':'READY'});
      if(owner&&network.status==='READY')network.paths=this.pathsFrom(owner,component,connectedVents,at);
      this.applyState(network);networks.push(network);
    }
    for(const unit of units){
      const touching=networks.filter(n=>n.sourceUnits.includes(unit));
      if(touching.length>1){
        for(const network of touching){network.sourceUnit=null;network.paths=[];network.status='MULTIPLE NETWORKS';this.applyState(network);}
      }
    }
    for(const unit of units){
      const connected=networks.filter(n=>n.sourceUnit===unit||n.sourceUnits.includes(unit));
      unit.networkId=connected.map(n=>n.id).join(',')||null;
      unit.networkStatus=connected.length?[...new Set(connected.map(n=>n.status))].join(' / '):'DISCONNECTED';
      unit.status=unit.enabled?(connected.find(n=>n.status==='READY')?.status||unit.networkStatus):'OFF';
    }
    for(const vent of vents){const network=networks.find(n=>n.vents.includes(vent));vent.networkId=network?.id||null;vent.networkStatus=network?.status||'DISCONNECTED';}
    return networks;
  }
  adjacentDucts(entity,at){return DIRS.map(([dx,dy])=>this.world.inBounds(entity.x+dx,entity.y+dy)?at.get(this.world.index(entity.x+dx,entity.y+dy)):null).filter(Boolean);}
  pathsFrom(unit,ducts,vents,at){
    const allowed=new Set(ducts.map(d=>this.world.index(d.x,d.y))),sources=this.adjacentDucts(unit,at),paths=[];
    for(const vent of vents){
      let found=null;
      for(const start of sources){
        const queue=[{duct:start,path:[start]}],seen=new Set([this.world.index(start.x,start.y)]);
        for(let head=0;head<queue.length&&!found;head++){
          const item=queue[head];if(this.adjacentDucts(vent,at).includes(item.duct)){found=item.path;break;}
          for(const [dx,dy] of DIRS){const x=item.duct.x+dx,y=item.duct.y+dy,i=this.world.inBounds(x,y)?this.world.index(x,y):-1,n=allowed.has(i)?at.get(i):null;if(n&&!seen.has(i)){seen.add(i);queue.push({duct:n,path:[...item.path,n]});}}
        }
        if(found)break;
      }
      if(found)paths.push({vent,path:found,flowRate:0,efficiency:this.pathEfficiency(found),cooling:0});
    }
    return paths;
  }
  pathEfficiency(path){
    let bends=0,prev=null;
    for(let i=1;i<path.length;i++){const dir={x:path[i].x-path[i-1].x,y:path[i].y-path[i-1].y};if(prev&&(dir.x!==prev.x||dir.y!==prev.y))bends++;prev=dir;}
    return Math.max(.65,1-Math.max(0,path.length-1)*.008-bends*.02);
  }
  applyState(network){
    for(const duct of network.ducts){duct.networkId=network.id;duct.networkRole='cooling';duct.networkStatus=network.status;duct.flowRate=0;duct.airTemperature=network.sourceUnit?.supplyTemperature??25;duct.direction={x:0,y:0};}
    if(network.sourceUnit)for(const path of network.paths)path.vent.networkStatus=network.status;
    network.totalLength=network.paths.reduce((sum,path)=>sum+path.path.length,0);
    network.effectiveEfficiency=network.paths.length?network.paths.reduce((sum,path)=>sum+path.efficiency,0)/network.paths.length:0;
  }
}
