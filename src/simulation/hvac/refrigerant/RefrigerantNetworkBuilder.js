import { RefrigerantCircuit } from './RefrigerantCircuit.js';
import { HVACPortResolver } from '../ports/HVACPortResolver.js';
import { HVAC } from '../HVACConstants.js';

const key=(x,y)=>`${x},${y}`;
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

export class RefrigerantNetworkBuilder {
  constructor(world){this.world=world;this.ports=new HVACPortResolver();this.version=-1;this.circuits=[];this.sequence=0;this.rebuildCount=0;}
  build({force=false}={}){
    const version=this.world.utilityTopologyVersion||0;if(!force&&this.version===version)return this.circuits;
    this.version=version;this.rebuildCount++;
    const world=this.world,lines=world.allUtilities().filter(item=>item.type==='refrigerantLine');
    const endpoints=[];
    for(const handler of world.entitiesByType('airHandler')){
      const port=this.ports.airHandler(handler).find(item=>item.type==='refrigerant'),cell=port?.cell;
      if(cell&&world.utilitiesAt(cell.x,cell.y).some(item=>item.type==='refrigerantLine'))endpoints.push({id:`${handler.id}:refrigerant`,kind:'endpoint',endpointType:'airHandler',entity:handler,port,cell});
    }
    for(const condenser of world.entitiesByType('condenser')){
      const port=this.ports.condenser(condenser),cell=port.cell;
      if(world.utilitiesAt(cell.x,cell.y).some(item=>item.type==='refrigerantLine'))endpoints.push({id:`${condenser.id}:refrigerant`,kind:'endpoint',endpointType:'condenser',entity:condenser,port,cell});
    }
    const nodes=[...lines.map(entity=>({id:entity.id,kind:'line',entity})),...endpoints];
    const byId=new Map(nodes.map(node=>[node.id,node])),adjacency=new Map(nodes.map(node=>[node.id,new Set()]));
    const connect=(a,b)=>{adjacency.get(a.id).add(b.id);adjacency.get(b.id).add(a.id);};
    const at=new Map();for(const node of nodes.filter(item=>item.kind==='line')){const k=key(node.entity.x,node.entity.y),list=at.get(k)||[];list.push(node);at.set(k,list);}
    for(const node of nodes.filter(item=>item.kind==='line')){
      for(const [dx,dy] of dirs)for(const other of at.get(key(node.entity.x+dx,node.entity.y+dy))||[])connect(node,other);
    }
    for(const endpoint of endpoints)for(const line of at.get(key(endpoint.cell.x,endpoint.cell.y))||[])connect(endpoint,line);

    for(const line of lines){line.circuitId=null;line.circuitStatus='OPEN CIRCUIT';line.networkStatus='OPEN CIRCUIT';line.capacityFactor=1;line.length=HVAC.tileLength;line.pressureLoss=0;line.direction={x:0,y:0};}
    for(const entity of [...world.entitiesByType('airHandler'),...world.entitiesByType('condenser')]){
      entity.refrigerantCircuitId=null;if(entity.type==='airHandler')entity.refrigerantStatus='NO REFRIGERANT LINE';
      else entity.circuitStatus='DISCONNECTED';
    }
    const seen=new Set(),circuits=[];
    for(const start of nodes){
      if(seen.has(start.id))continue;
      const stack=[start],members=[];seen.add(start.id);
      while(stack.length){const node=stack.pop();members.push(node);for(const id of adjacency.get(node.id)||[])if(!seen.has(id)){seen.add(id);stack.push(byId.get(id));}}
      const componentLines=members.filter(node=>node.kind==='line').map(node=>node.entity);
      if(!componentLines.length)continue;
      const attached=members.filter(node=>node.kind==='endpoint'),handlers=attached.filter(node=>node.endpointType==='airHandler').map(node=>node.entity),
        condensers=attached.filter(node=>node.endpointType==='condenser').map(node=>node.entity);
      const branchCount=componentLines.filter(line=>(adjacency.get(line.id)?.size||0)>2).length;
      let status='READY';
      if(handlers.length===0&&condensers.length===0)status='OPEN CIRCUIT';
      else if(handlers.length===0)status='NO AIR HANDLER';
      else if(condensers.length===0)status='NO CONDENSER';
      else if(handlers.length>1)status='MULTIPLE AIR HANDLERS';
      else if(condensers.length>1)status='MULTIPLE CONDENSERS';
      else if(branchCount)status='BRANCHED CIRCUIT';
      const circuit=new RefrigerantCircuit({id:`REF-${String(++this.sequence).padStart(2,'0')}`,nodes:members,adjacency,status,handlers,condensers,lines:componentLines});
      if(status==='READY'&&circuit.length>HVAC.maxRefrigerantLength) circuit.status='LINE TOO LONG';
      circuit.diagnostics.status=circuit.status;
      for(const line of componentLines){line.circuitId=circuit.id;line.circuitStatus=circuit.status;line.networkStatus=circuit.status;line.capacityFactor=circuit.capacityFactor;}
      for(const handler of handlers){handler.refrigerantCircuitId=circuit.id;handler.refrigerantStatus=circuit.status;}
      for(const condenser of condensers){condenser.refrigerantCircuitId=circuit.id;condenser.circuitStatus=circuit.status;condenser.airHandlerId=handlers.length===1?handlers[0].id:null;}
      circuits.push(circuit);
    }
    this.circuits=circuits;return circuits;
  }
  circuitFor(handler){return this.circuits.find(circuit=>circuit.handlers.includes(handler))||null;}
}
