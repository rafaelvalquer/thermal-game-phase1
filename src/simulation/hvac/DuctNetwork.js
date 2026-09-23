import { DuctJunction } from '../../entities/DuctJunction.js';

export class DuctNetwork {
  constructor({id,role,nodes,adjacency}){
    this.id=id;this.role=role;this.nodes=nodes;this.adjacency=adjacency;
    this.ducts=nodes.filter(node=>node.kind==='duct').map(node=>node.entity);
    this.terminals=nodes.filter(node=>node.kind==='terminal').map(node=>node.entity);
    this.airHandlers=this.terminals.filter(entity=>entity.type==='airHandler');
    this.vents=this.terminals.filter(entity=>entity.type===(role==='supply'?'supplyVent':'returnVent'));
    const byId=new Map(nodes.map(node=>[node.entity.id,node]));
    this.paths=[];this.flowRate=0;this.pressure=0;this.status='DISCONNECTED';
    this.junctions=this.nodes.filter(node=>node.kind==='duct'&&(adjacency.get(node.entity.id)?.size||0)>=3)
      .map(node=>new DuctJunction(node.entity.x,node.entity.y,{degree:adjacency.get(node.entity.id).size,networkId:id}));
    this.deadEnds=this.nodes.filter(node=>node.kind==='duct'&&(adjacency.get(node.entity.id)?.size||0)===1)
      .filter(node=>{
        const neighborId=[...(adjacency.get(node.entity.id)||[])][0];
        const neighbor=byId.get(neighborId);
        return neighbor?.kind==='duct';
      }).map(node=>node.entity);
  }
}
