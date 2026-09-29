import { isPowered } from './PowerState.js';
import { CARDINALS, keyOf, manhattan } from '../utils/GridUtils.js';
import { clamp } from '../utils/MathUtils.js';
import { WATER_CP } from '../utils/Constants.js';
import { HydraulicSolver, MIN_FLOW } from './fluid/HydraulicSolver.js';

const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger']);

export class FluidSystem {
  constructor(world,metrics){
    this.world=world;
    this.metrics=metrics;
    this.networks=[];this.lastTopologyVersion=-1;this.monitor=null;this.hydraulic=new HydraulicSolver();
  }
  set monitor(value){this._monitor=value;if(this.hydraulic)this.hydraulic.monitor=value;}
  get monitor(){return this._monitor||null;}

  update(dt){
    if(this.lastTopologyVersion!==this.world.fluidTopologyVersion){this.networks=this.buildNetworks();this.lastTopologyVersion=this.world.fluidTopologyVersion;this.monitor?.count('fluidRebuildCount');}
    for(const network of this.networks)this.hydraulic.solveIfNeeded(network);
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
        hydraulicSignature:null,
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

  solveNetwork(network){return this.hydraulic.solveNetwork(network);}

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
