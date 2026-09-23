import { DuctJunction } from '../../entities/DuctJunction.js';

export class DuctNetwork {
  constructor({id,role=null,nodes,adjacency,status=null}){
    this.id=id;this.role=role;this.nodes=nodes;this.adjacency=adjacency;
    this.ducts=nodes.filter(node=>node.kind==='duct').map(node=>node.entity);
    this.handlerPorts=nodes.filter(node=>node.kind==='port');
    this.terminals=nodes.filter(node=>node.kind==='terminal'||node.kind==='port').map(node=>node.entity);
    this.airHandlers=[...new Map(this.handlerPorts.map(node=>[node.entity.handler.id,node.entity.handler])).values()];
    this.supplyVents=this.terminals.filter(entity=>entity.type==='supplyVent');
    this.returnVents=this.terminals.filter(entity=>entity.type==='returnVent');
    this.vents=role==='supply'?this.supplyVents:role==='return'?this.returnVents:[...this.supplyVents,...this.returnVents];
    const byId=new Map(nodes.map(node=>[node.entity.id,node]));
    this.paths=[];this.flowRate=0;this.pressure=0;this.status=status||'DISCONNECTED';this.designFlowRate=0;
    this.junctions=nodes.filter(node=>node.kind==='duct'&&(adjacency.get(node.entity.id)?.size||0)>=3)
      .map(node=>new DuctJunction(node.entity.x,node.entity.y,{degree:adjacency.get(node.entity.id).size,networkId:id}));
    this.deadEnds=nodes.filter(node=>node.kind==='duct'&&(adjacency.get(node.entity.id)?.size||0)===1)
      .filter(node=>byId.get([...(adjacency.get(node.entity.id)||[])][0])?.kind==='duct').map(node=>node.entity);
  }
}
