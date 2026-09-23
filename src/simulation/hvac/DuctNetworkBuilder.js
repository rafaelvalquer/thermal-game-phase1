import { HVAC } from './HVACConstants.js';
import { DuctNetwork } from './DuctNetwork.js';

const key=(x,y)=>`${x},${y}`;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

export class DuctNetworkBuilder {
  constructor(world){this.world=world;this.sequence=0;}

  build(){return [...this.buildRole('supply'),...this.buildRole('return')];}

  buildRole(role){
    const ventType=role==='supply'?'supplyVent':'returnVent';
    const ducts=this.world.allUtilities().filter(entity=>HVAC.ductTypes.has(entity.type)&&entity.role===role);
    const terminals=this.world.entities.filter(entity=>entity.type==='airHandler'||entity.type===ventType);
    const nodes=[...ducts.map(entity=>({kind:'duct',entity})),...terminals.map(entity=>({kind:'terminal',entity}))];
    const at=new Map();for(const node of nodes){const k=key(node.entity.x,node.entity.y),list=at.get(k)||[];list.push(node);at.set(k,list);}
    const adjacency=new Map(nodes.map(node=>[node.entity.id,new Set()]));
    for(const node of nodes){
      const {x,y}=node.entity;
      for(const [dx,dy] of dirs)for(const other of at.get(key(x+dx,y+dy))||[]){
        if(other===node)continue;
        if(node.kind==='terminal'&&other.kind==='terminal'&&other.entity.type!=='airHandler'&&node.entity.type!=='airHandler')continue;
        adjacency.get(node.entity.id).add(other.entity.id);adjacency.get(other.entity.id).add(node.entity.id);
      }
      for(const other of at.get(key(x,y))||[]){
        if(other===node)continue;
        adjacency.get(node.entity.id).add(other.entity.id);adjacency.get(other.entity.id).add(node.entity.id);
      }
    }

    const byId=new Map(nodes.map(node=>[node.entity.id,node])),seen=new Set(),networks=[];
    for(const start of nodes){
      if(seen.has(start.entity.id))continue;
      const stack=[start],members=[];seen.add(start.entity.id);
      while(stack.length){const node=stack.pop();members.push(node);for(const id of adjacency.get(node.entity.id)){if(!seen.has(id)){seen.add(id);stack.push(byId.get(id));}}}
      const network=new DuctNetwork({id:`HVAC-${String(++this.sequence).padStart(2,'0')}-${role==='supply'?'S':'R'}`,role,nodes:members,adjacency});
      network.status=network.airHandlers.length===0?'NO AIR HANDLER':network.airHandlers.length>1?'MULTIPLE AIR HANDLERS':network.vents.length===0?(role==='supply'?'NO SUPPLY VENT':'NO RETURN'):'READY';
      for(const node of members){
        node.entity.networkId=network.id;node.entity.networkStatus=network.status;
        if(node.kind==='duct'){
          node.entity.flowRate=0;node.entity.pressure=0;node.entity.pressureLoss=0;node.entity.velocity=0;
          node.entity.direction={x:0,y:0};node.entity.upstreamId=null;node.entity.downstreamId=null;node.entity.deadEnd=false;
        }else if(node.entity.type!=='airHandler'){
          node.entity.flowRate=0;node.entity.pressure=0;
        }
      }
      for(const duct of network.ducts){
        const damper=this.world.utilityAt(duct.x,duct.y,'ductDamper');
        if(damper){damper.networkId=network.id;damper.networkStatus=network.status;}
      }
      for(const duct of network.deadEnds){duct.networkStatus=network.status==='READY'?'DEAD END':network.status;duct.deadEnd=true;}
      networks.push(network);
    }
    return networks;
  }
}
