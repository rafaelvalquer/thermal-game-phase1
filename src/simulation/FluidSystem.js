import { isPowered } from './PowerState.js';
import { CARDINALS, keyOf, manhattan } from '../utils/GridUtils.js';
import { clamp } from '../utils/MathUtils.js';
import { WATER_CP } from '../utils/Constants.js';

const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger']);
const MIN_FLOW=0.01;
const MAX_FLOW=3.5;

const statusLabel={
  CLOSED:'CLOSED',
  OPEN_CIRCUIT:'OPEN CIRCUIT',
  BRANCHED:'BRANCHED',
  NO_PUMP:'NO PUMP',
  PUMP_OFF:'PUMP OFF',
  MULTIPLE_PUMPS:'MULTIPLE PUMPS',
  PUMP_DIRECTION_INVALID:'PUMP DIRECTION',
};

function solveLinearSystem(diagonal,edges,values){
  const size=values.length;if(!size)return [];
  const multiply=vector=>{
    const result=new Float64Array(size);
    for(const {a,b,conductance} of edges){
      const av=a<0?0:vector[a],bv=b<0?0:vector[b],difference=conductance*(av-bv);
      if(a>=0)result[a]+=difference;if(b>=0)result[b]-=difference;
    }
    return result;
  };
  const solution=new Float64Array(size),residual=Float64Array.from(values),preconditioned=new Float64Array(size),direction=new Float64Array(size);
  let normSquared=0,product=0;
  for(let i=0;i<size;i++){
    normSquared+=residual[i]*residual[i];preconditioned[i]=residual[i]/diagonal[i];direction[i]=preconditioned[i];product+=residual[i]*preconditioned[i];
  }
  const target=Math.max(1e-24,normSquared*1e-22),maximumIterations=Math.min(10000,Math.max(64,size*4));
  for(let iteration=0;iteration<maximumIterations&&normSquared>target;iteration++){
    const projected=multiply(direction);let denominator=0;
    for(let i=0;i<size;i++)denominator+=direction[i]*projected[i];
    if(denominator<=1e-30)return null;
    const alpha=product/denominator;normSquared=0;
    for(let i=0;i<size;i++){solution[i]+=alpha*direction[i];residual[i]-=alpha*projected[i];normSquared+=residual[i]*residual[i];}
    if(normSquared<=target)break;
    let nextProduct=0;
    for(let i=0;i<size;i++){preconditioned[i]=residual[i]/diagonal[i];nextProduct+=residual[i]*preconditioned[i];}
    const beta=nextProduct/product;
    for(let i=0;i<size;i++)direction[i]=preconditioned[i]+beta*direction[i];
    product=nextProduct;
  }
  return normSquared<=target?Array.from(solution):null;
}

export class FluidSystem {
  constructor(world,metrics){
    this.world=world;
    this.metrics=metrics;
    this.networks=[];this.lastTopologyVersion=-1;this.monitor=null;
  }

  update(dt){
    if(this.lastTopologyVersion!==this.world.fluidTopologyVersion){this.networks=this.buildNetworks();this.lastTopologyVersion=this.world.fluidTopologyVersion;this.monitor?.count('fluidRebuildCount');}
    for(const network of this.networks)this.solveNetwork(network);
    this.exchangeMachines(dt);
    this.radiate(dt);
    for(const network of this.networks)this.transport(network,dt);
  }

  fluidEntities(){return [...FLUID_TYPES].flatMap(type=>this.world.entitiesByType(type));}

  buildNetworks(){
    const entities=this.fluidEntities();
    const byPos=new Map(entities.map(e=>[keyOf(e.x,e.y),e]));
    const seen=new Set();
    const networks=[];
    let index=1;

    for(const start of entities){
      if(seen.has(start.id))continue;
      const stack=[start],members=[];
      seen.add(start.id);

      while(stack.length){
        const entity=stack.pop();
        members.push(entity);
        for(const [dx,dy] of CARDINALS){
          const neighbor=byPos.get(keyOf(entity.x+dx,entity.y+dy));
          if(neighbor&&!seen.has(neighbor.id)){seen.add(neighbor.id);stack.push(neighbor);}
        }
      }

      const network={
        id:'FLUID-'+index++,
        entities:members,
        byPos,
        neighbors:new Map(),
        order:[],
        links:[],
        edges:[],
        closed:false,
        status:'DISCONNECTED',
        flowRate:0,
        resistance:0,
        pump:null,
      };

      for(const entity of members){
        const neighbors=[];
        for(const [dx,dy] of CARDINALS){
          const candidate=byPos.get(keyOf(entity.x+dx,entity.y+dy));
          if(candidate&&members.includes(candidate))neighbors.push(candidate);
        }
        network.neighbors.set(entity.id,neighbors);
        this.resetEntityDiagnostics(entity,network.id);
      }

      networks.push(network);
    }
    return networks;
  }

  resetEntityDiagnostics(entity,networkId){
    entity.networkId=networkId;
    entity.networkStatus='DISCONNECTED';
    entity.circuitClosed=false;
    entity.flowRate=0;
    entity.upstreamId=null;
    entity.downstreamId=null;
    entity.flowVector={x:0,y:0};
    entity.flowLinks=[];
    entity.inletTemperature=entity.waterTemperature;
    entity.outletTemperature=entity.waterTemperature;
    entity.thermalPower=0;
    if(entity.type==='exchanger'){entity.machineId=null;entity.airCoolingPower=0;}
    if(entity.type==='radiator'){
      entity.airInTemperature=this.world.inBounds(entity.x,entity.y)?this.world.temperatureAt(entity.x,entity.y):25;
      entity.airOutTemperature=entity.airInTemperature;
      entity.fanBoost=1;
    }
  }

  invalidate(network,status){
    network.status=status;
    network.closed=false;
    network.flowRate=0;
    for(const entity of network.entities){
      entity.networkStatus=statusLabel[status]||status;
      entity.circuitClosed=false;
      entity.flowRate=0;
      entity.flowLinks=[];
    }
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

    const pumps=network.entities.filter(e=>e.type==='pump');
    const enabledPumps=pumps.filter(p=>isPowered(p));
    if(!pumps.length)return this.invalidate(network,'NO_PUMP');
    if(!enabledPumps.length)return this.invalidate(network,'PUMP_OFF');
    if(enabledPumps.length>1)return this.invalidate(network,'MULTIPLE_PUMPS');

    const pump=enabledPumps[0];
    const pumpNeighbors=network.neighbors.get(pump.id);
    const targetX=pump.x+(pump.direction?.x??1);
    const targetY=pump.y+(pump.direction?.y??0);
    const first=pumpNeighbors.find(n=>n.x===targetX&&n.y===targetY);
    if(!first)return this.invalidate(network,'PUMP_DIRECTION_INVALID');
    const reference=entities.length-1,diagonal=new Float64Array(reference),matrixEdges=[],rhs=new Float64Array(reference);
    for(const edge of edges){
      const a=indexById.get(edge.a.id),b=indexById.get(edge.b.id),conductance=1/Math.max(edge.resistance,1e-9);
      const head=edge.a===pump&&edge.b===first?pump.hydraulicPower:edge.b===pump&&edge.a===first?-pump.hydraulicPower:0;
      if(a!==reference){diagonal[a]+=conductance;rhs[a]-=conductance*head;}
      if(b!==reference){diagonal[b]+=conductance;rhs[b]+=conductance*head;}
      matrixEdges.push({a:a===reference?-1:a,b:b===reference?-1:b,conductance});
      edge.head=head;
    }
    const solved=solveLinearSystem(diagonal,matrixEdges,rhs);
    if(!solved)return this.invalidate(network,'OPEN_CIRCUIT');
    const pressure=entities.map((_,index)=>index===reference?0:solved[index]);
    for(const edge of edges){
      const signedFlow=(pressure[indexById.get(edge.a.id)]-pressure[indexById.get(edge.b.id)]+edge.head)/edge.resistance;
      if(signedFlow>=0){edge.from=edge.a;edge.to=edge.b;edge.flowRate=signedFlow;}
      else{edge.from=edge.b;edge.to=edge.a;edge.flowRate=-signedFlow;}
    }
    const pumpEdge=edges.find(edge=>(edge.a===pump&&edge.b===first)||(edge.b===pump&&edge.a===first));
    const unboundedFlow=pumpEdge?(pumpEdge.from===pump?pumpEdge.flowRate:-pumpEdge.flowRate):0;
    if(unboundedFlow<=MIN_FLOW)return this.invalidate(network,'PUMP_DIRECTION_INVALID');
    const flowScale=Math.min(1,MAX_FLOW/unboundedFlow);
    const links=edges.map(edge=>({...edge,flowRate:edge.flowRate*flowScale}));
    const incoming=new Map(entities.map(entity=>[entity.id,[]])),outgoing=new Map(entities.map(entity=>[entity.id,[]])),incident=new Map(entities.map(entity=>[entity.id,[]]));
    for(const link of links){
      incident.get(link.from.id).push(link);incident.get(link.to.id).push(link);
      if(link.flowRate<=MIN_FLOW)continue;
      outgoing.get(link.from.id).push(link);incoming.get(link.to.id).push(link);
    }
    for(const entity of entities){
      const input=incoming.get(entity.id),output=outgoing.get(entity.id),inputFlow=input.reduce((sum,link)=>sum+link.flowRate,0),outputFlow=output.reduce((sum,link)=>sum+link.flowRate,0);
      entity.networkStatus='CLOSED';entity.circuitClosed=true;entity.flowRate=(inputFlow+outputFlow)*.5;
      entity.flowLinks=incident.get(entity.id);
      entity.upstreamId=input.length===1?input[0].from.id:null;
      entity.downstreamId=output.length===1?output[0].to.id:null;
      const vector=output.reduce((sum,link)=>({x:sum.x+(link.to.x-entity.x)*link.flowRate,y:sum.y+(link.to.y-entity.y)*link.flowRate}),{x:0,y:0});
      const magnitude=Math.hypot(vector.x,vector.y)||1;entity.flowVector={x:vector.x/magnitude,y:vector.y/magnitude};
    }
    const flow=unboundedFlow*flowScale;
    const resistance=pump.hydraulicPower/Math.max(unboundedFlow,MIN_FLOW);
    network.edges=links;network.links=links.filter(link=>link.flowRate>MIN_FLOW);
    network.order=[];
    network.pump=pump;
    network.resistance=resistance;
    network.flowRate=flow;
    network.closed=true;
    network.status='CLOSED';
    pump.flowRate=flow;
    return network;
  }

  hasBridge(entities,neighbors){
    let time=0;const entered=new Map(),low=new Map(),bridges=new Set();
    const visit=(entity,parent)=>{
      entered.set(entity.id,++time);low.set(entity.id,time);
      for(const neighbor of neighbors.get(entity.id)){
        if(neighbor===parent)continue;
        if(!entered.has(neighbor.id)){
          visit(neighbor,entity);low.set(entity.id,Math.min(low.get(entity.id),low.get(neighbor.id)));
          if(low.get(neighbor.id)>entered.get(entity.id))bridges.add(`${entity.id}:${neighbor.id}`);
        }else low.set(entity.id,Math.min(low.get(entity.id),entered.get(neighbor.id)));
      }
    };
    if(entities.length)visit(entities[0],null);
    return bridges.size>0;
  }

  transport(network,dt){
    if(!network.closed||network.flowRate<=MIN_FLOW)return;
    const temperatures=new Map(network.entities.map(entity=>[entity.id,entity.waterTemperature])),deltas=new Map(network.entities.map(entity=>[entity.id,0])),incoming=new Map(network.entities.map(entity=>[entity.id,{flow:0,temperatureFlow:0}]));
    for(const link of network.links){
      const movedMass=link.flowRate*dt,energy=movedMass*WATER_CP*temperatures.get(link.from.id);
      deltas.set(link.from.id,deltas.get(link.from.id)-energy);deltas.set(link.to.id,deltas.get(link.to.id)+energy);
      const input=incoming.get(link.to.id);input.flow+=link.flowRate;input.temperatureFlow+=link.flowRate*temperatures.get(link.from.id);
    }
    for(const entity of network.entities){
      const input=incoming.get(entity.id);if(input.flow>MIN_FLOW)entity.inletTemperature=input.temperatureFlow/input.flow;
      entity.energy+=deltas.get(entity.id);entity.outletTemperature=entity.waterTemperature;
    }
  }

  exchangeMachines(dt){
    const machines=this.world.entities.filter(e=>e.isHeatMachine);
    for(const exchanger of this.world.entitiesByType('exchanger')){
      exchanger.thermalPower=0;
      exchanger.machineId=null;
      exchanger.airCoolingPower=0;
      if(dt<=0||!isPowered(exchanger)||!exchanger.circuitClosed||exchanger.flowRate<=MIN_FLOW)continue;

      const machine=machines
        .filter(m=>manhattan(m,exchanger)<=1)
        .sort((a,b)=>b.temperature-a.temperature)[0];
      if(machine){
        exchanger.machineId=machine.id;
        const deltaT=machine.temperature-exchanger.waterTemperature;
        if(deltaT>1e-5){
          const capacityRate=exchanger.flowRate*WATER_CP;
          const effectiveness=1-Math.exp(-exchanger.ua/Math.max(capacityRate,1));
          const qDot=effectiveness*capacityRate*deltaT;
          const machineCapacity=machine.mass*machine.heatCapacity;
          const waterCapacity=exchanger.waterMass*WATER_CP;
          const qEq=deltaT/(1/machineCapacity+1/waterCapacity);
          const q=clamp(qDot*dt,0,qEq*.4);
          machine.energy-=q;
          exchanger.energy+=q;
          exchanger.thermalPower+=q/dt;
          machine.coolingPower+=q/dt;
        }
      }
      this.exchangeAir(exchanger,dt);
    }
  }

  nearbyExchangerAir(exchanger){
    const world=this.world;
    if(!world.isAir(exchanger.x,exchanger.y))return [];
    const queue=[{x:exchanger.x,y:exchanger.y,distance:0}],seen=new Set([keyOf(exchanger.x,exchanger.y)]),cells=[];
    for(let head=0;head<queue.length;head++){
      const {x,y,distance}=queue[head];
      cells.push({index:world.index(x,y),weight:1/(1+distance)});
      if(distance>=2)continue;
      for(const [dx,dy] of CARDINALS){
        const nx=x+dx,ny=y+dy,key=keyOf(nx,ny);
        if(seen.has(key)||!world.inBounds(nx,ny)||!world.isAir(nx,ny))continue;
        seen.add(key);queue.push({x:nx,y:ny,distance:distance+1});
      }
    }
    return cells;
  }

  exchangeAir(exchanger,dt){
    const world=this.world,cells=this.nearbyExchangerAir(exchanger),waterT=exchanger.waterTemperature;
    let weightedDelta=0,totalWeight=0,weightedExcess=0;
    const hot=[];
    for(const cell of cells){
      const deltaT=world.temperatureAtIndex(cell.index)-waterT;
      if(deltaT<=0)continue;
      const excess=deltaT*world.capacityAtIndex(cell.index),weighted=excess*cell.weight;
      hot.push({...cell,weighted});weightedDelta+=deltaT*cell.weight;totalWeight+=cell.weight;weightedExcess+=weighted;
    }
    if(!hot.length||weightedExcess<=0)return;
    const capacityRate=exchanger.flowRate*WATER_CP;
    const effectiveness=1-Math.exp(-exchanger.airUA/Math.max(capacityRate,1));
    const qDot=effectiveness*capacityRate*weightedDelta/totalWeight;
    const q=Math.min(qDot*dt,weightedExcess*.35);
    if(q<=0)return;
    for(const cell of hot)world.energy[cell.index]-=q*cell.weighted/weightedExcess;
    exchanger.energy+=q;
    exchanger.airCoolingPower=q/dt;
    exchanger.thermalPower+=exchanger.airCoolingPower;
  }

  radiatorCells(radiator){
    const cells=[];
    let weightSum=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const x=radiator.x+dx,y=radiator.y+dy;
      if(!this.world.inBounds(x,y)||!this.world.isAir(x,y))continue;
      const weight=dx===0&&dy===0?4:(dx===0||dy===0?2:1);
      cells.push({x,y,index:this.world.index(x,y),weight});
      weightSum+=weight;
    }
    return {cells,weightSum};
  }

  radiate(dt){
    const world=this.world;
    for(const radiator of world.entitiesByType('radiator')){
      radiator.thermalPower=0;
      if(dt<=0||!isPowered(radiator))continue;

      const {cells,weightSum}=this.radiatorCells(radiator);
      if(!cells.length||weightSum<=0)continue;

      let weightedAir=0,totalAirCapacity=0;
      for(const cell of cells){
        weightedAir+=world.temperatureAtIndex(cell.index)*cell.weight;
        totalAirCapacity+=world.capacityAtIndex(cell.index);
      }
      const airIn=weightedAir/weightSum;
      const waterT=radiator.waterTemperature;
      const deltaT=waterT-airIn;
      radiator.airInTemperature=airIn;
      if(Math.abs(deltaT)<1e-5){radiator.airOutTemperature=airIn;continue;}

      let airflow=0;
      for(const cell of cells)airflow+=Math.hypot(world.airX[cell.index],world.airY[cell.index])*cell.weight;
      airflow/=weightSum;
      const fanBoost=1+Math.min(2.5,airflow*.45);
      radiator.fanBoost=fanBoost;

      let qDot;
      if(radiator.circuitClosed&&radiator.flowRate>MIN_FLOW){
        const capacityRate=radiator.flowRate*WATER_CP;
        const effectiveness=1-Math.exp(-(radiator.ua*fanBoost)/Math.max(capacityRate,1));
        qDot=effectiveness*capacityRate*deltaT;
      }else{
        qDot=radiator.ua*.08*deltaT;
      }

      const waterCapacity=radiator.waterMass*WATER_CP;
      const qEq=Math.abs(deltaT)/(1/waterCapacity+1/Math.max(totalAirCapacity,1));
      const q=clamp(qDot*dt,-qEq*.3,qEq*.3);

      radiator.energy-=q;
      for(const cell of cells)world.energy[cell.index]+=q*(cell.weight/weightSum);
      radiator.thermalPower=q/dt;

      let weightedOut=0;
      for(const cell of cells)weightedOut+=world.temperatureAtIndex(cell.index)*cell.weight;
      radiator.airOutTemperature=weightedOut/weightSum;
    }
  }
}
