import { isPowered } from './PowerState.js';
import { CARDINALS, keyOf } from '../utils/GridUtils.js';
import { clamp } from '../utils/MathUtils.js';
import { WATER_CP } from '../utils/Constants.js';
import { HydraulicSolver, MIN_FLOW } from './fluid/HydraulicSolver.js';
import { FluidAirStencilCache } from './fluid/FluidAirStencilCache.js';
import { ExchangerTargetCache } from './fluid/ExchangerTargetCache.js';

const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger']);

export class FluidSystem {
  constructor(world,metrics){
    this.world=world;
    this.metrics=metrics;
    this.networks=[];this.lastTopologyVersion=-1;this.monitor=null;this.hydraulic=new HydraulicSolver();this.airStencils=new FluidAirStencilCache(world);this.exchangerTargets=new ExchangerTargetCache(world);
    world.fluidSystem=this;world.fluidNetworks=this.networks;
  }
  set monitor(value){this._monitor=value;if(this.hydraulic)this.hydraulic.monitor=value;}
  get monitor(){return this._monitor||null;}

  update(dt){
    if(this.lastTopologyVersion!==this.world.fluidTopologyVersion){this.networks=this.buildNetworks();this.world.fluidNetworks=this.networks;this.lastTopologyVersion=this.world.fluidTopologyVersion;this.monitor?.count('fluidRebuildCount');}
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
        bounds:{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},
        runtime:{indexById:new Map(),temperatures:new Float64Array(members.length),energyDelta:new Float64Array(members.length),incomingFlow:new Float64Array(members.length),incomingTemperatureFlow:new Float64Array(members.length)},
      };

      for(let memberIndex=0;memberIndex<members.length;memberIndex++){
        const entity=members[memberIndex];network.runtime.indexById.set(entity.id,memberIndex);
        network.bounds.minX=Math.min(network.bounds.minX,entity.x);network.bounds.minY=Math.min(network.bounds.minY,entity.y);network.bounds.maxX=Math.max(network.bounds.maxX,entity.x);network.bounds.maxY=Math.max(network.bounds.maxY,entity.y);
        const neighbors=[];
        for(const [dx,dy] of CARDINALS){
          const candidate=byPos.get(keyOf(entity.x+dx,entity.y+dy));
          if(candidate)neighbors.push(candidate);
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
    this.monitor?.begin?.('fluidTransportMs');
    try{return this.transportNetwork(network,dt);}finally{this.monitor?.end?.('fluidTransportMs');}
  }

  transportNetwork(network,dt){
    if(!network.closed||network.flowRate<=MIN_FLOW)return;
    const runtime=network.runtime,{temperatures,energyDelta,incomingFlow,incomingTemperatureFlow,indexById}=runtime;
    for(let i=0;i<network.entities.length;i++){temperatures[i]=network.entities[i].waterTemperature;energyDelta[i]=0;incomingFlow[i]=0;incomingTemperatureFlow[i]=0;}
    for(const link of network.links){
      const from=indexById.get(link.from.id),to=indexById.get(link.to.id),flow=link.flowRate,energy=flow*dt*WATER_CP*temperatures[from];
      energyDelta[from]-=energy;energyDelta[to]+=energy;incomingFlow[to]+=flow;incomingTemperatureFlow[to]+=flow*temperatures[from];
    }
    for(let i=0;i<network.entities.length;i++){
      const entity=network.entities[i];if(incomingFlow[i]>MIN_FLOW)entity.inletTemperature=incomingTemperatureFlow[i]/incomingFlow[i];
      entity.energy+=energyDelta[i];entity.outletTemperature=entity.waterTemperature;
    }
  }

  exchangeMachines(dt){
    for(const exchanger of this.world.entitiesByType('exchanger')){
      exchanger.thermalPower=0;
      exchanger.machineId=null;
      exchanger.airCoolingPower=0;
      if(dt<=0||!isPowered(exchanger)||!exchanger.circuitClosed||exchanger.flowRate<=MIN_FLOW)continue;

      let machine=null;
      for(const candidate of this.exchangerTargets.adjacentMachines(exchanger))if(!machine||candidate.temperature>machine.temperature)machine=candidate;
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
    return this.airStencils.exchangerCells(exchanger);
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
    return this.airStencils.radiatorStencil(radiator);
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
