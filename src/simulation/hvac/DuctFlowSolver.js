import { DuctPressureSolver } from './DuctPressureSolver.js';

export class DuctFlowSolver {
  constructor(world){this.world=world;this.pressure=new DuctPressureSolver();}

  shortestPath(network,start,target){
    const byId=new Map(network.nodes.map(node=>[node.entity.id,node])),queue=[start.entity.id],previous=new Map([[start.entity.id,null]]);
    while(queue.length){
      const id=queue.shift();if(id===target.entity.id)break;
      for(const next of network.adjacency.get(id)||[])if(!previous.has(next)){previous.set(next,id);queue.push(next);}
    }
    if(!previous.has(target.entity.id))return [];
    const path=[];for(let id=target.entity.id;id!==null;id=previous.get(id))path.push(byId.get(id));
    return path.reverse();
  }

  solve(network){
    if(network.status!=='READY')return network;
    const handlerNode=network.handlerPorts.find(node=>node.service===network.role),candidates=[];
    if(!handlerNode||!network.airHandlers.length)return network;
    for(const vent of network.vents){
      const ventNode=network.nodes.find(node=>node.kind==='terminal'&&node.entity.id===vent.id),path=this.shortestPath(network,handlerNode,ventNode);
      if(!path.length)continue;
      if(network.role==='return')path.reverse();
      const resistance=this.pressure.pathResistance(path);
      candidates.push({vent,path,resistance,conductance:Number.isFinite(resistance)&&resistance>0?1/Math.sqrt(resistance):0});
    }
    const handler=network.airHandlers[0],sum=candidates.reduce((n,item)=>n+item.conductance,0);
    const equivalent=this.pressure.equivalentResistance(candidates.map(item=>item.resistance));
    const total=this.pressure.availableFlow(candidates.map(item=>item.resistance),handler.maxAirFlow);
    network.designFlowRate=total;
    network.pressure=Number.isFinite(equivalent)?equivalent*total*total:0;network.flowRate=total;
    network.paths=candidates.map(item=>({
      ...item,flowRate:sum?total*item.conductance/sum:0,designFlowRate:sum?total*item.conductance/sum:0,
    }));
    for(const duct of network.ducts){duct.flowRate=0;duct.pressure=0;duct.pressureLoss=0;duct.velocity=0;duct._pressureWeight=0;duct.upstreamId=null;duct.downstreamId=null;}
    for(const path of network.paths){
      path.pressureDrop=Number.isFinite(path.resistance)?path.resistance*path.flowRate*path.flowRate:0;
      path.vent.flowRate=path.flowRate;path.vent.pressure=(network.role==='supply'?1:-1)*path.pressureDrop;path.vent.networkStatus=path.flowRate>0?'READY':'BLOCKED';
      const ductCount=path.path.filter(item=>item.kind==='duct').length;let ductIndex=0;
      for(let i=0;i<path.path.length;i++){
        const node=path.path[i];if(node.kind!=='duct')continue;
        const duct=node.entity;duct.flowRate+=path.flowRate;duct.networkStatus=path.flowRate>0?'READY':'BLOCKED';
        const fraction=(ductIndex+1)/(ductCount+1),staticPressure=network.role==='supply'?path.pressureDrop*(1-fraction):-path.pressureDrop*fraction;
        duct.pressure+=staticPressure*path.flowRate;duct._pressureWeight+=path.flowRate;
        duct.pressureLoss+=ductCount?path.pressureDrop/ductCount:0;
        const next=path.path.slice(i+1).find(item=>item.kind!=='duct');
        const prev=path.path.slice(0,i).reverse().find(item=>item.kind!=='duct');
        duct.upstreamId=prev?.entity.handler?.id||prev?.entity.id||null;duct.downstreamId=next?.entity.handler?.id||next?.entity.id||null;
        if(next)duct.direction={x:Math.sign(next.entity.x-duct.x),y:Math.sign(next.entity.y-duct.y)};
        ductIndex++;
      }
    }
    for(const duct of network.ducts){if(duct._pressureWeight>0)duct.pressure/=duct._pressureWeight;duct.velocity=duct.flowRate/Math.max(duct.crossSectionArea,.001);delete duct._pressureWeight;}
    for(const duct of network.ducts){const damper=this.world.utilityAt(duct.x,duct.y,'ductDamper');if(damper){damper.networkId=network.id;damper.networkStatus=duct.networkStatus;}}
    return network;
  }
}
