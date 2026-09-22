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

export class FluidSystem {
  constructor(world,metrics){
    this.world=world;
    this.metrics=metrics;
    this.networks=[];
  }

  update(dt){
    this.networks=this.buildNetworks();
    for(const network of this.networks)this.solveNetwork(network);
    this.exchangeMachines(dt);
    this.radiate(dt);
    for(const network of this.networks)this.transport(network,dt);
  }

  fluidEntities(){return this.world.entities.filter(e=>FLUID_TYPES.has(e.type));}

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
    entity.inletTemperature=entity.waterTemperature;
    entity.outletTemperature=entity.waterTemperature;
    entity.thermalPower=0;
    if(entity.type==='exchanger')entity.machineId=null;
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
    }
    return network;
  }

  solveNetwork(network){
    const degrees=network.entities.map(e=>network.neighbors.get(e.id).length);
    if(network.entities.length<3||degrees.some(d=>d<2))return this.invalidate(network,'OPEN_CIRCUIT');
    if(degrees.some(d=>d>2))return this.invalidate(network,'BRANCHED');

    const pumps=network.entities.filter(e=>e.type==='pump');
    const enabledPumps=pumps.filter(p=>p.enabled);
    if(!pumps.length)return this.invalidate(network,'NO_PUMP');
    if(!enabledPumps.length)return this.invalidate(network,'PUMP_OFF');
    if(enabledPumps.length>1)return this.invalidate(network,'MULTIPLE_PUMPS');

    const pump=enabledPumps[0];
    const pumpNeighbors=network.neighbors.get(pump.id);
    const targetX=pump.x+(pump.direction?.x??1);
    const targetY=pump.y+(pump.direction?.y??0);
    const first=pumpNeighbors.find(n=>n.x===targetX&&n.y===targetY);
    if(!first)return this.invalidate(network,'PUMP_DIRECTION_INVALID');

    const order=[pump];
    const visited=new Set([pump.id]);
    let previous=pump,current=first;

    while(current.id!==pump.id){
      if(visited.has(current.id))return this.invalidate(network,'OPEN_CIRCUIT');
      visited.add(current.id);
      order.push(current);
      const next=network.neighbors.get(current.id).find(n=>n.id!==previous.id);
      if(!next)return this.invalidate(network,'OPEN_CIRCUIT');
      previous=current;
      current=next;
      if(order.length>network.entities.length+1)return this.invalidate(network,'OPEN_CIRCUIT');
    }

    if(order.length!==network.entities.length)return this.invalidate(network,'OPEN_CIRCUIT');

    const resistance=order.reduce((sum,e)=>sum+(e.resistance||1),0)||1;
    const flow=clamp(pump.hydraulicPower/resistance,0,MAX_FLOW);
    network.order=order;
    network.pump=pump;
    network.resistance=resistance;
    network.flowRate=flow;
    network.closed=true;
    network.status='CLOSED';
    network.links=[];

    for(let i=0;i<order.length;i++){
      const entity=order[i];
      const upstream=order[(i-1+order.length)%order.length];
      const downstream=order[(i+1)%order.length];
      entity.networkStatus='CLOSED';
      entity.circuitClosed=true;
      entity.flowRate=flow;
      entity.upstreamId=upstream.id;
      entity.downstreamId=downstream.id;
      entity.flowVector={x:downstream.x-entity.x,y:downstream.y-entity.y};
      network.links.push({from:entity,to:downstream});
    }
    return network;
  }

  transport(network,dt){
    if(!network.closed||network.flowRate<=MIN_FLOW)return;
    const order=network.order;
    const temperatures=new Map(order.map(e=>[e.id,e.waterTemperature]));
    const deltas=new Map(order.map(e=>[e.id,0]));
    const movedMass=network.flowRate*dt;

    for(let i=0;i<order.length;i++){
      const current=order[i];
      const upstream=order[(i-1+order.length)%order.length];
      const Tin=temperatures.get(upstream.id);
      const Tcell=temperatures.get(current.id);
      const q=movedMass*WATER_CP*(Tin-Tcell);
      deltas.set(current.id,deltas.get(current.id)+q);
      current.inletTemperature=Tin;
    }

    for(const entity of order)entity.energy+=deltas.get(entity.id);
    for(const entity of order)entity.outletTemperature=entity.waterTemperature;
  }

  exchangeMachines(dt){
    const machines=this.world.entities.filter(e=>e.isHeatMachine);
    for(const exchanger of this.world.entitiesByType('exchanger')){
      exchanger.thermalPower=0;
      exchanger.machineId=null;
      if(!exchanger.enabled||!exchanger.circuitClosed||exchanger.flowRate<=MIN_FLOW)continue;

      const machine=machines
        .filter(m=>manhattan(m,exchanger)<=1)
        .sort((a,b)=>b.temperature-a.temperature)[0];
      if(!machine)continue;

      exchanger.machineId=machine.id;
      const deltaT=machine.temperature-exchanger.waterTemperature;
      if(Math.abs(deltaT)<1e-5)continue;

      const capacityRate=exchanger.flowRate*WATER_CP;
      const effectiveness=1-Math.exp(-exchanger.ua/Math.max(capacityRate,1));
      const qDot=effectiveness*capacityRate*deltaT;
      const machineCapacity=machine.mass*machine.heatCapacity;
      const waterCapacity=exchanger.waterMass*WATER_CP;
      const qEq=Math.abs(deltaT)/(1/machineCapacity+1/waterCapacity);
      const q=clamp(qDot*dt,-qEq*.4,qEq*.4);

      machine.energy-=q;
      exchanger.energy+=q;
      exchanger.thermalPower=q/dt;
      if(q>0)machine.coolingPower+=q/dt;
    }
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
      if(!radiator.enabled)continue;

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
