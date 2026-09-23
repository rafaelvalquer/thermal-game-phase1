import { HVAC } from './HVACConstants.js';
import { DuctNetwork } from './DuctNetwork.js';
import { HVACPortResolver } from './ports/HVACPortResolver.js';

const key=(x,y)=>`${x},${y}`;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

export class DuctNetworkBuilder {
  constructor(world){this.world=world;this.sequence=0;this.portResolver=new HVACPortResolver();this.cacheVersion=-1;this.cached=[];this.rebuildCount=0;}

  build({force=false}={}){
    const version=this.world.utilityTopologyVersion||0;
    if(!force&&this.cacheVersion===version)return this.cached;
    this.rebuildCount++;this.cacheVersion=version;
    const world=this.world,ducts=world.allUtilities().filter(entity=>HVAC.ductTypes.has(entity.type));
    const vents=world.entities.filter(entity=>entity.type==='supplyVent'||entity.type==='returnVent');
    const ports=world.entities.filter(entity=>entity.type==='airHandler').flatMap(handler=>this.portResolver.airHandler(handler)
      .filter(port=>port.type==='supply'||port.type==='return')
      .map(port=>({id:port.id,kind:'port',service:port.type,entity:{id:port.id,type:'airHandlerPort',x:handler.x,y:handler.y,handler,port}})));
    const nodes=[...ducts.map(entity=>({kind:'duct',entity})),...vents.map(entity=>({kind:'terminal',entity})),...ports];
    const byId=new Map(nodes.map(node=>[node.entity.id,node])),adjacency=new Map(nodes.map(node=>[node.entity.id,new Set()]));
    const connect=(a,b)=>{if(a===b)return;adjacency.get(a.entity.id).add(b.entity.id);adjacency.get(b.entity.id).add(a.entity.id);};
    const ductsAt=new Map();for(const node of nodes.filter(item=>item.kind==='duct')){const cell=key(node.entity.x,node.entity.y),list=ductsAt.get(cell)||[];list.push(node);ductsAt.set(cell,list);}
    const ventsAt=new Map();for(const node of nodes.filter(item=>item.kind==='terminal')){const cell=key(node.entity.x,node.entity.y),list=ventsAt.get(cell)||[];list.push(node);ventsAt.set(cell,list);}
    for(const node of nodes.filter(item=>item.kind==='duct')){
      const {x,y}=node.entity;
      for(const [dx,dy] of dirs){
        for(const other of ductsAt.get(key(x+dx,y+dy))||[])connect(node,other);
        for(const terminal of ventsAt.get(key(x+dx,y+dy))||[])connect(node,terminal);
      }
    }
    for(const portNode of ports){
      const cell=portNode.entity.port.cell;
      for(const duct of ductsAt.get(key(cell.x,cell.y))||[])connect(portNode,duct);
    }

    for(const item of ducts){item.networkId=null;item.networkRole=null;item.networkStatus='DISCONNECTED';item.flowRate=0;item.pressure=0;item.pressureLoss=0;item.velocity=0;item.direction={x:0,y:0};item.upstreamId=null;item.downstreamId=null;item.deadEnd=false;}
    for(const vent of vents){vent.networkId=null;vent.networkStatus='DISCONNECTED';vent.networkRole=null;vent.flowRate=0;vent.pressure=0;}
    for(const handler of world.entitiesByType('airHandler')){handler.networkIds=[];handler.supplyNetworkId=null;handler.returnNetworkId=null;}

    const seen=new Set(),networks=[];
    for(const start of nodes){
      if(seen.has(start.entity.id))continue;
      // Unconnected AH ports do not form phantom networks. The handler reports
      // the missing circuit from the absence of a classified network.
      if(start.kind==='port'&&!(adjacency.get(start.entity.id)?.size)){seen.add(start.entity.id);continue;}
      const stack=[start],members=[];seen.add(start.entity.id);
      while(stack.length){const node=stack.pop();members.push(node);for(const id of adjacency.get(node.entity.id)||[])if(!seen.has(id)){seen.add(id);stack.push(byId.get(id));}}
      const handlerPortTypes=new Set(members.filter(node=>node.kind==='port').map(node=>node.service));
      const supplyTerminals=members.filter(node=>node.kind==='terminal'&&node.entity.type==='supplyVent');
      const returnTerminals=members.filter(node=>node.kind==='terminal'&&node.entity.type==='returnVent');
      const mixed=handlerPortTypes.size>1||(supplyTerminals.length>0&&returnTerminals.length>0)||
        handlerPortTypes.has('supply')&&returnTerminals.length>0||handlerPortTypes.has('return')&&supplyTerminals.length>0;
      const airHandlers=new Set(members.filter(node=>node.kind==='port').map(node=>node.entity.handler.id));
      const service=handlerPortTypes.size===1?[...handlerPortTypes][0]:supplyTerminals.length&&!returnTerminals.length?'supply':returnTerminals.length&&!supplyTerminals.length?'return':null;
      const role=mixed?'invalid':service;
      let status;
      if(mixed)status='SUPPLY / RETURN CROSS-CONNECTION';
      else if(airHandlers.size>1)status='MULTIPLE AIR HANDLERS';
      else if(!airHandlers.size)status=members.some(node=>node.kind==='duct'||node.kind==='terminal')?'NO AIR HANDLER':'UNCONNECTED';
      else if(service==='supply'&&!supplyTerminals.length)status='NO SUPPLY VENT';
      else if(service==='return'&&!returnTerminals.length)status='NO RETURN VENT';
      else status='READY';
      const network=new DuctNetwork({id:`HVAC-${String(++this.sequence).padStart(2,'0')}-${role==='supply'?'S':role==='return'?'R':'X'}`,role,nodes:members,adjacency,status});
      for(const node of members){
        const entity=node.entity;entity.networkId=network.id;entity.networkStatus=status;
        if(node.kind==='duct'){entity.networkRole=role;entity.deadEnd=network.deadEnds.includes(entity);}
        if(node.kind==='terminal')entity.networkRole=role;
        if(node.kind==='port'){
          const handler=entity.handler;handler.networkIds.push(network.id);
          if(node.service==='supply')handler.supplyNetworkId=network.id;
          if(node.service==='return')handler.returnNetworkId=network.id;
        }
      }
      for(const duct of network.ducts){
        const damper=world.utilityAt(duct.x,duct.y,'ductDamper');
        if(damper){damper.networkId=network.id;damper.networkStatus=status;damper.networkRole=role;}
      }
      for(const duct of network.deadEnds)if(status==='READY'){duct.networkStatus='DEAD END';duct.deadEnd=true;}
      networks.push(network);
    }
    this.cached=networks;return networks;
  }
}
