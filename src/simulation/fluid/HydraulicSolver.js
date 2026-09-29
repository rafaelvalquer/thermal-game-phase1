import { isPowered } from '../PowerState.js';

export const MIN_FLOW=0.01;
const MAX_FLOW=3.5;
const statusLabel={CLOSED:'CLOSED',OPEN_CIRCUIT:'OPEN CIRCUIT',BRANCHED:'BRANCHED',NO_PUMP:'NO PUMP',PUMP_OFF:'PUMP OFF',MULTIPLE_PUMPS:'MULTIPLE PUMPS',PUMP_DIRECTION_INVALID:'PUMP DIRECTION'};

function solveLinearSystem(diagonal,edges,values){
  const size=values.length;if(!size)return [];
  const multiply=vector=>{
    const result=new Float64Array(size);
    for(const {a,b,conductance} of edges){const av=a<0?0:vector[a],bv=b<0?0:vector[b],difference=conductance*(av-bv);if(a>=0)result[a]+=difference;if(b>=0)result[b]-=difference;}
    return result;
  };
  const solution=new Float64Array(size),residual=Float64Array.from(values),preconditioned=new Float64Array(size),direction=new Float64Array(size);
  let normSquared=0,product=0;
  for(let i=0;i<size;i++){normSquared+=residual[i]*residual[i];preconditioned[i]=residual[i]/diagonal[i];direction[i]=preconditioned[i];product+=residual[i]*preconditioned[i];}
  const target=Math.max(1e-24,normSquared*1e-22),maximumIterations=Math.min(10000,Math.max(64,size*4));
  for(let iteration=0;iteration<maximumIterations&&normSquared>target;iteration++){
    const projected=multiply(direction);let denominator=0;for(let i=0;i<size;i++)denominator+=direction[i]*projected[i];
    if(denominator<=1e-30)return null;
    const alpha=product/denominator;normSquared=0;
    for(let i=0;i<size;i++){solution[i]+=alpha*direction[i];residual[i]-=alpha*projected[i];normSquared+=residual[i]*residual[i];}
    if(normSquared<=target)break;
    let nextProduct=0;for(let i=0;i<size;i++){preconditioned[i]=residual[i]/diagonal[i];nextProduct+=residual[i]*preconditioned[i];}
    const beta=nextProduct/product;for(let i=0;i<size;i++)direction[i]=preconditioned[i]+beta*direction[i];product=nextProduct;
  }
  return normSquared<=target?Array.from(solution):null;
}

export class HydraulicSolver {
  constructor({monitor=null}={}){this.monitor=monitor;this.solveCount=0;}

  signature(network){
    return network.entities.map(entity=>{
      const direction=entity.direction||{};
      return `${entity.id}:${entity.resistance||1}:${entity.type==='pump'?`${Number(isPowered(entity))}:${entity.hydraulicPower}:${direction.x??1}:${direction.y??0}`:''}`;
    }).join('|');
  }

  solveIfNeeded(network){
    const signature=this.signature(network);if(network.hydraulicSignature===signature)return false;
    this.monitor?.begin?.('hydraulicSolveMs');this.monitor?.count?.('hydraulicSolveCount');
    try{this.solveNetwork(network);network.hydraulicSignature=signature;this.solveCount++;}finally{this.monitor?.end?.('hydraulicSolveMs');}
    return true;
  }

  invalidate(network,status){
    network.status=status;network.closed=false;network.flowRate=0;
    for(const entity of network.entities){entity.networkStatus=statusLabel[status]||status;entity.circuitClosed=false;entity.flowRate=0;entity.flowLinks=[];}
    return network;
  }

  solveNetwork(network){
    const degrees=new Map(network.entities.map(entity=>[entity.id,network.neighbors.get(entity.id).length]));
    if(network.entities.length<3||[...degrees.values()].some(degree=>degree<2))return this.invalidate(network,'OPEN_CIRCUIT');
    if([...degrees.values()].some(degree=>degree>3))return this.invalidate(network,'BRANCHED');

    const entities=network.entities,indexById=new Map(entities.map((entity,index)=>[entity.id,index])),edges=[];
    for(const entity of entities)for(const neighbor of network.neighbors.get(entity.id)){
      if(indexById.get(entity.id)>=indexById.get(neighbor.id))continue;
      edges.push({a:entity,b:neighbor,resistance:(entity.resistance||1)/degrees.get(entity.id)+(neighbor.resistance||1)/degrees.get(neighbor.id),flowRate:0});
    }
    if(this.hasBridge(entities,network.neighbors))return this.invalidate(network,'OPEN_CIRCUIT');

    const pumps=network.entities.filter(entity=>entity.type==='pump'),enabledPumps=pumps.filter(pump=>isPowered(pump));
    if(!pumps.length)return this.invalidate(network,'NO_PUMP');
    if(!enabledPumps.length)return this.invalidate(network,'PUMP_OFF');
    if(enabledPumps.length>1)return this.invalidate(network,'MULTIPLE_PUMPS');

    const pump=enabledPumps[0],pumpNeighbors=network.neighbors.get(pump.id),targetX=pump.x+(pump.direction?.x??1),targetY=pump.y+(pump.direction?.y??0);
    const first=pumpNeighbors.find(neighbor=>neighbor.x===targetX&&neighbor.y===targetY);
    if(!first)return this.invalidate(network,'PUMP_DIRECTION_INVALID');
    const reference=entities.length-1,diagonal=new Float64Array(reference),matrixEdges=[],rhs=new Float64Array(reference);
    for(const edge of edges){
      const a=indexById.get(edge.a.id),b=indexById.get(edge.b.id),conductance=1/Math.max(edge.resistance,1e-9);
      const head=edge.a===pump&&edge.b===first?pump.hydraulicPower:edge.b===pump&&edge.a===first?-pump.hydraulicPower:0;
      if(a!==reference){diagonal[a]+=conductance;rhs[a]-=conductance*head;}
      if(b!==reference){diagonal[b]+=conductance;rhs[b]+=conductance*head;}
      matrixEdges.push({a:a===reference?-1:a,b:b===reference?-1:b,conductance});edge.head=head;
    }
    const solved=solveLinearSystem(diagonal,matrixEdges,rhs);if(!solved)return this.invalidate(network,'OPEN_CIRCUIT');
    const pressure=entities.map((_,index)=>index===reference?0:solved[index]);
    for(const edge of edges){
      const signedFlow=(pressure[indexById.get(edge.a.id)]-pressure[indexById.get(edge.b.id)]+edge.head)/edge.resistance;
      if(signedFlow>=0){edge.from=edge.a;edge.to=edge.b;edge.flowRate=signedFlow;}else{edge.from=edge.b;edge.to=edge.a;edge.flowRate=-signedFlow;}
    }
    const pumpEdge=edges.find(edge=>(edge.a===pump&&edge.b===first)||(edge.b===pump&&edge.a===first));
    const unboundedFlow=pumpEdge?(pumpEdge.from===pump?pumpEdge.flowRate:-pumpEdge.flowRate):0;
    if(unboundedFlow<=MIN_FLOW)return this.invalidate(network,'PUMP_DIRECTION_INVALID');
    const flowScale=Math.min(1,MAX_FLOW/unboundedFlow),links=edges.map(edge=>({...edge,flowRate:edge.flowRate*flowScale}));
    const incoming=new Map(entities.map(entity=>[entity.id,[]])),outgoing=new Map(entities.map(entity=>[entity.id,[]])),incident=new Map(entities.map(entity=>[entity.id,[]]));
    for(const link of links){incident.get(link.from.id).push(link);incident.get(link.to.id).push(link);if(link.flowRate<=MIN_FLOW)continue;outgoing.get(link.from.id).push(link);incoming.get(link.to.id).push(link);}
    for(const entity of entities){
      const input=incoming.get(entity.id),output=outgoing.get(entity.id),inputFlow=input.reduce((sum,link)=>sum+link.flowRate,0),outputFlow=output.reduce((sum,link)=>sum+link.flowRate,0);
      entity.networkStatus='CLOSED';entity.circuitClosed=true;entity.flowRate=(inputFlow+outputFlow)*.5;entity.flowLinks=incident.get(entity.id);
      entity.upstreamId=input.length===1?input[0].from.id:null;entity.downstreamId=output.length===1?output[0].to.id:null;
      const vector=output.reduce((sum,link)=>({x:sum.x+(link.to.x-entity.x)*link.flowRate,y:sum.y+(link.to.y-entity.y)*link.flowRate}),{x:0,y:0}),magnitude=Math.hypot(vector.x,vector.y)||1;
      entity.flowVector={x:vector.x/magnitude,y:vector.y/magnitude};
    }
    network.edges=links;network.links=links.filter(link=>link.flowRate>MIN_FLOW);network.order=[];network.pump=pump;
    network.resistance=pump.hydraulicPower/Math.max(unboundedFlow,MIN_FLOW);network.flowRate=unboundedFlow*flowScale;network.closed=true;network.status='CLOSED';pump.flowRate=network.flowRate;
    return network;
  }

  hasBridge(entities,neighbors){
    let time=0;const entered=new Map(),low=new Map(),bridges=new Set();
    const visit=(entity,parent)=>{
      entered.set(entity.id,++time);low.set(entity.id,time);
      for(const neighbor of neighbors.get(entity.id)){
        if(neighbor===parent)continue;
        if(!entered.has(neighbor.id)){visit(neighbor,entity);low.set(entity.id,Math.min(low.get(entity.id),low.get(neighbor.id)));if(low.get(neighbor.id)>entered.get(entity.id))bridges.add(`${entity.id}:${neighbor.id}`);}
        else low.set(entity.id,Math.min(low.get(entity.id),entered.get(neighbor.id)));
      }
    };
    if(entities.length)visit(entities[0],null);return bridges.size>0;
  }
}
