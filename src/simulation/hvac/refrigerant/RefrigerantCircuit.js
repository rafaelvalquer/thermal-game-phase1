export class RefrigerantCircuit {
  constructor({id,nodes,adjacency,status,handlers=[],condensers=[],lines=[]}){
    this.id=id;this.nodes=nodes;this.adjacency=adjacency;this.status=status;
    this.handlers=handlers;this.condensers=condensers;this.lines=lines;
    this.length=lines.length*.5;
    this.resistance=lines.reduce((sum,line)=>sum+line.pressureLoss,0);
    this.capacityFactor=RefrigerantCircuit.capacityFactorFor(this.length);
    this.capacity=(handlers[0]?.coolingCapacity??0)*this.capacityFactor;
    this.flowRate=0;
    this.branchCount=lines.filter(line=>(adjacency.get(line.id)?.size||0)>2).length;
    this.diagnostics={length:this.length,status,capacityFactor:this.capacityFactor,lines:lines.length};
  }
  static capacityFactorFor(length){
    if(length<=10)return 1-length*.002;
    if(length<=20)return .98-(length-10)*.003;
    if(length<=30)return .95-(length-20)*.007;
    return Math.max(.25,.88-(length-30)*.02);
  }
}
