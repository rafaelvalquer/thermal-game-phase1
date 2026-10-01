import { isPowered } from './PowerState.js';
import { CARDINALS, keyOf } from '../utils/GridUtils.js';
import { clamp } from '../utils/MathUtils.js';
import { WATER_CP } from '../utils/Constants.js';
import { HydraulicSolver, MIN_FLOW } from './fluid/HydraulicSolver.js';
import { FluidAirStencilCache } from './fluid/FluidAirStencilCache.js';
import { ExchangerTargetCache } from './fluid/ExchangerTargetCache.js';
import { FluidThermalSolver } from './fluid/FluidThermalSolver.js';

const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger','waterChiller']);

/** Couples sensible heat in the water loop, equipment and surrounding air. */
export class FluidSystem {
  constructor(world,metrics){
    this.world=world;this.metrics=metrics;this.networks=[];this.lastTopologyVersion=-1;this.monitor=null;
    this.hydraulic=new HydraulicSolver();this.thermalSolver=new FluidThermalSolver();this.airStencils=new FluidAirStencilCache(world);this.exchangerTargets=new ExchangerTargetCache(world);
    this.stepEnergy=new Map();this.stepCaptureEnergy=new Map();this.stepAirEnergy=new Map();this.accumulating=false;
    world.fluidSystem=this;world.fluidNetworks=this.networks;
  }
  set monitor(value){this._monitor=value;if(this.hydraulic)this.hydraulic.monitor=value;}
  get monitor(){return this._monitor||null;}

  update(dt){
    if(this.lastTopologyVersion!==this.world.fluidTopologyVersion){this.networks=this.buildNetworks();this.world.fluidNetworks=this.networks;this.lastTopologyVersion=this.world.fluidTopologyVersion;this.monitor?.count('fluidRebuildCount');}
    this.stepEnergy.clear();this.stepCaptureEnergy.clear();this.stepAirEnergy.clear();this.accumulating=true;
    for(const entity of this.fluidEntities()){entity.thermalPower=0;if(entity.type==='exchanger'){entity.directCoolingPower=0;entity.airCoolingPower=0;}if(entity.type==='waterChiller'){entity.coolingPower=0;entity.rejectedHeatPower=0;entity.power=0;entity.requestedPower=0;}}
    for(const machine of this.world.heatMachines)machine._fluidCoolingEnergy=0;
    for(const network of this.networks){
      this.hydraulic.solveIfNeeded(network);
      this.resetNetworkDiagnostics(network);
      if(!network.closed||network.flowRate<=MIN_FLOW||dt<=0)continue;
      const substeps=this.thermalSolver.substeps(network,dt);
      const subDt=dt/substeps;
      for(let step=0;step<substeps;step++){
        this.transportNetwork(network,subDt);
        this.exchangeMachines(subDt,network);
        this.chillWater(subDt,network);
        this.radiate(subDt,network);
      }
    }
    this.accumulating=false;
    if(dt>0){
      for(const [entity,joules] of this.stepEnergy)entity.thermalPower=joules/dt;
      for(const [entity,joules] of this.stepCaptureEnergy)entity.directCoolingPower=joules/dt;
      for(const [entity,joules] of this.stepAirEnergy)entity.airCoolingPower=joules/dt;
      for(const machine of this.world.heatMachines)if(machine._fluidCoolingEnergy){machine.coolingPower+=machine._fluidCoolingEnergy/dt;delete machine._fluidCoolingEnergy;}
      for(const exchanger of this.world.entitiesByType('exchanger'))if(exchanger.flowRate>MIN_FLOW){exchanger.outletTemperature=exchanger.inletTemperature+exchanger.thermalPower/(exchanger.flowRate*WATER_CP);exchanger.deltaTemperature=exchanger.outletTemperature-exchanger.inletTemperature;}
      for(const radiator of this.world.entitiesByType('radiator'))if(radiator.flowRate>MIN_FLOW){radiator.outletTemperature=radiator.inletTemperature-radiator.thermalPower/(radiator.flowRate*WATER_CP);radiator.deltaTemperature=radiator.outletTemperature-radiator.inletTemperature;}
    }
  }

  fluidEntities(){return [...FLUID_TYPES].flatMap(type=>this.world.entitiesByType(type));}

  buildNetworks(){
    const entities=this.fluidEntities(),byPos=new Map(entities.map(e=>[keyOf(e.x,e.y),e])),seen=new Set(),networks=[];let index=1;
    for(const start of entities){
      if(seen.has(start.id))continue;
      const stack=[start],members=[];seen.add(start.id);
      while(stack.length){const entity=stack.pop();members.push(entity);for(const [dx,dy] of CARDINALS){const neighbor=byPos.get(keyOf(entity.x+dx,entity.y+dy));if(neighbor&&!seen.has(neighbor.id)){seen.add(neighbor.id);stack.push(neighbor);}}}
      const network={id:'FLUID-'+index++,entities:members,exchangers:members.filter(entity=>entity.type==='exchanger'),radiators:members.filter(entity=>entity.type==='radiator'),chillers:members.filter(entity=>entity.type==='waterChiller'),byPos,neighbors:new Map(),order:[],links:[],edges:[],closed:false,status:'DISCONNECTED',flowRate:0,resistance:0,pump:null,hydraulicSignature:null,bounds:{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},runtime:{indexById:new Map(),temperatures:new Float64Array(members.length),energyDelta:new Float64Array(members.length),incomingFlow:new Float64Array(members.length),incomingTemperatureFlow:new Float64Array(members.length),outgoingFlow:new Float64Array(members.length),outgoingTemperatureFlow:new Float64Array(members.length)}};
      for(const entity of members){const i=network.runtime.indexById.size;network.runtime.indexById.set(entity.id,i);network.bounds.minX=Math.min(network.bounds.minX,entity.x);network.bounds.minY=Math.min(network.bounds.minY,entity.y);network.bounds.maxX=Math.max(network.bounds.maxX,entity.x);network.bounds.maxY=Math.max(network.bounds.maxY,entity.y);const neighbors=[];for(const [dx,dy] of CARDINALS){const candidate=byPos.get(keyOf(entity.x+dx,entity.y+dy));if(candidate)neighbors.push(candidate);}network.neighbors.set(entity.id,neighbors);this.resetEntityDiagnostics(entity,network.id);}
      networks.push(network);
    }
    return networks;
  }

  resetEntityDiagnostics(entity,networkId){
    entity.networkId=networkId;entity.networkStatus='DISCONNECTED';entity.circuitClosed=false;entity.flowRate=0;entity.upstreamId=null;entity.downstreamId=null;entity.flowVector={x:0,y:0};entity.flowLinks=[];entity.inletTemperature=entity.waterTemperature;entity.outletTemperature=entity.waterTemperature;entity.deltaTemperature=0;entity.thermalPower=0;
    if(entity.type==='exchanger'){entity.machineId=null;entity.airCoolingPower=0;entity.captureMode='IDLE';}
    if(entity.type==='waterChiller'){entity.coolingPower=0;entity.rejectedHeatPower=0;}
    if(entity.type==='radiator'){entity.airInTemperature=this.world.inBounds(entity.x,entity.y)?this.world.temperatureAt(entity.x,entity.y):this.world.environment.temperature;entity.airOutTemperature=entity.airInTemperature;entity.fanBoost=1;entity.rejectedToExterior=this.radiatorIsOutdoor(entity);}
  }
  radiatorIsOutdoor(radiator){
    const environment=this.world.environmentTopology;
    if(environment){environment.ensureCurrent();return environment.isExterior(radiator.x,radiator.y);}
    return Boolean(radiator.outdoor);
  }
  resetNetworkDiagnostics(network){for(const entity of network.entities){entity.thermalPower=0;if(entity.type==='exchanger'){entity.airCoolingPower=0;entity.captureMode='IDLE';}if(entity.type==='radiator')entity.rejectedToExterior=this.radiatorIsOutdoor(entity);}}

  recordTransfer(entity,joules,dt,kind='total'){
    if(this.accumulating){this.stepEnergy.set(entity,(this.stepEnergy.get(entity)||0)+joules);if(kind==='direct')this.stepCaptureEnergy.set(entity,(this.stepCaptureEnergy.get(entity)||0)+joules);if(kind==='air')this.stepAirEnergy.set(entity,(this.stepAirEnergy.get(entity)||0)+joules);return;}
    entity.thermalPower=(entity.thermalPower||0)+joules/dt;
    if(kind==='direct')entity.directCoolingPower=(entity.directCoolingPower||0)+joules/dt;
    if(kind==='air')entity.airCoolingPower=(entity.airCoolingPower||0)+joules/dt;
  }

  chillWater(dt,network=null){
    for(const chiller of network?network.chillers:this.world.entitiesByType('waterChiller')){
      if(dt<=0||!isPowered(chiller)||!chiller.circuitClosed||chiller.flowRate<=MIN_FLOW){chiller.power=0;chiller.requestedPower=0;chiller.coolingPower=0;chiller.rejectedHeatPower=0;continue;}
      const inlet=Number(chiller.inletTemperature??chiller.waterTemperature),target=chiller.targetTemperature??15,capacityRate=chiller.flowRate*WATER_CP;
      const availableWater=Math.max(0,chiller.energy-chiller.waterMass*WATER_CP*target)/Math.max(dt,1e-6);
      const qDot=Math.max(0,Math.min(chiller.ratedCapacity??80000,capacityRate*Math.max(0,inlet-target),availableWater));
      if(qDot<=0){chiller.power=0;chiller.requestedPower=0;chiller.coolingPower=0;chiller.rejectedHeatPower=0;continue;}
      const q=qDot*dt;chiller.energy=Math.max(chiller.waterMass*WATER_CP*target,chiller.energy-q);
      if(this.world.inBounds(chiller.x,chiller.y)&&this.world.isAir(chiller.x,chiller.y))this.world.addEnergyAt(chiller.x,chiller.y,q);
      chiller.coolingPower=qDot;chiller.thermalPower=qDot;chiller.rejectedHeatPower=qDot+qDot/Math.max(1,chiller.cop||4);
      chiller.power=qDot/Math.max(1,chiller.cop||4);chiller.requestedPower=chiller.power;
      chiller.outletTemperature=inlet-qDot/Math.max(capacityRate,1);chiller.deltaTemperature=chiller.outletTemperature-inlet;
    }
  }

  solveNetwork(network){return this.hydraulic.solveNetwork(network);}
  transport(network,dt){this.monitor?.begin?.('fluidTransportMs');try{return this.transportNetwork(network,dt);}finally{this.monitor?.end?.('fluidTransportMs');}}

  transportNetwork(network,dt){
    return this.thermalSolver.transportNetwork(network,dt);
  }

  exchangeMachines(dt,network=null){
    for(const exchanger of network?network.exchangers:this.world.entitiesByType('exchanger')){
      exchanger.machineId=null;exchanger.airCoolingPower=0;exchanger.captureMode='IDLE';
      if(dt<=0||!isPowered(exchanger)||!exchanger.circuitClosed||exchanger.flowRate<=MIN_FLOW)continue;
      let machine=null;for(const candidate of this.exchangerTargets.adjacentMachines(exchanger))if(!machine||candidate.temperature>machine.temperature)machine=candidate;
      if(machine){
        exchanger.machineId=machine.id;exchanger.captureMode='DIRECT_RACK';
        const sourceTemperature=machine.temperature+(exchanger.sourceTemperatureLift??15),waterIn=Number(exchanger.inletTemperature??exchanger.waterTemperature),deltaT=sourceTemperature-waterIn;
        if(deltaT>0){
          const capacityRate=exchanger.flowRate*WATER_CP,effectiveness=1-Math.exp(-Math.max(0,exchanger.ua||0)/Math.max(capacityRate,1)),uaPower=effectiveness*capacityRate*deltaT;
          const machineCapacity=Math.max(1,machine.mass*machine.heatCapacity),target=machine.slaTemperature??35,excessJ=Math.max(0,machine.energy-machineCapacity*target);
          const recoverySeconds=clamp(exchanger.recoverySeconds??30,20,40),capturableW=Math.max(0,machine.heatGenerationPower||0)*(exchanger.captureFraction??.9)+excessJ/recoverySeconds;
          const waterCapacity=Math.max(1,exchanger.waterMass*WATER_CP),waterHeadroomW=waterCapacity*Math.max(0,sourceTemperature-exchanger.waterTemperature)/Math.max(dt,1e-6);
          const sensibleHeadroomW=Math.max(0,machine.energy-machineCapacity*25)/Math.max(dt,1e-6);
          const qDot=Math.min(exchanger.ratedCapacity??30000,uaPower,capturableW,waterHeadroomW,sensibleHeadroomW),q=Math.max(0,qDot*dt);
          if(q>0){machine.energy=Math.max(machineCapacity*25,machine.energy-q);exchanger.energy+=q;this.recordTransfer(exchanger,q,dt,'direct');if(this.accumulating)machine._fluidCoolingEnergy=(machine._fluidCoolingEnergy||0)+q;else machine.coolingPower+=q/dt;}
        }
      }else this.exchangeAir(exchanger,dt);
      const flowHeatCapacity=exchanger.flowRate*WATER_CP;
      if(flowHeatCapacity>0&&!this.accumulating){exchanger.outletTemperature=exchanger.inletTemperature+(exchanger.thermalPower||0)/flowHeatCapacity;exchanger.deltaTemperature=exchanger.outletTemperature-exchanger.inletTemperature;}
    }
  }

  nearbyExchangerAir(exchanger){return this.airStencils.exchangerCells(exchanger);}
  exchangeAir(exchanger,dt){
    const world=this.world,cells=this.nearbyExchangerAir(exchanger),waterT=Number(exchanger.inletTemperature??exchanger.waterTemperature);let weightedExcess=0,weightedDelta=0,totalWeight=0;const hot=[];
    for(const cell of cells){const delta=world.temperatureAtIndex(cell.index)-waterT;if(delta<=0)continue;const excess=delta*world.capacityAtIndex(cell.index),weighted=excess*cell.weight;hot.push({...cell,weighted});weightedDelta+=delta*cell.weight;totalWeight+=cell.weight;weightedExcess+=weighted;}
    if(!hot.length||weightedExcess<=1e-6)return;
    const capacityRate=exchanger.flowRate*WATER_CP,effectiveness=1-Math.exp(-Math.max(0,exchanger.airUA||0)/Math.max(capacityRate,1)),qDot=Math.min(exchanger.airRatedCapacity??12000,effectiveness*capacityRate*weightedDelta/Math.max(totalWeight,1e-9)),q=Math.min(qDot*dt,weightedExcess*.35);
    if(q<=0)return;
    for(const cell of hot)world.energy[cell.index]-=q*cell.weighted/weightedExcess;
    exchanger.energy+=q;this.recordTransfer(exchanger,q,dt,'air');exchanger.captureMode='AIR_COIL';
  }

  radiatorCells(radiator){return this.airStencils.radiatorStencil(radiator);}
  radiate(dt,network=null){
    const world=this.world;
    for(const radiator of network?network.radiators:world.entitiesByType('radiator')){
      if(dt<=0||!isPowered(radiator))continue;
      const {cells,weightSum}=this.radiatorCells(radiator),outdoor=this.radiatorIsOutdoor(radiator);let weightedAir=0,totalAirCapacity=0;
      for(const cell of cells){weightedAir+=world.temperatureAtIndex(cell.index)*cell.weight;totalAirCapacity+=world.capacityAtIndex(cell.index);}
      const airIn=outdoor?world.environment.temperature:(weightSum>0?weightedAir/weightSum:world.environment.temperature),waterIn=radiator.flowRate>MIN_FLOW?Number(radiator.inletTemperature??radiator.waterTemperature):radiator.waterTemperature,deltaT=waterIn-airIn;
      radiator.airInTemperature=airIn;
      const approach=radiator.minimumApproach??2.5,usableDelta=deltaT-approach;
      if(usableDelta<=0||(!outdoor&&(!cells.length||weightSum<=0))){radiator.airOutTemperature=airIn;radiator.fanBoost=1;continue;}
      let airflow=0;for(const cell of cells)airflow+=Math.hypot(world.airX[cell.index],world.airY[cell.index])*cell.weight;airflow=weightSum?airflow/weightSum:0;
      const fanBoost=1+Math.min(2.5,airflow*.45)+(isPowered(radiator)?Math.min(.8,(radiator.power||0)/750):0);radiator.fanBoost=fanBoost;
      let qDot;
      if(radiator.circuitClosed&&radiator.flowRate>MIN_FLOW){const capacityRate=radiator.flowRate*WATER_CP,effectiveness=1-Math.exp(-Math.max(0,radiator.ua||0)*fanBoost/Math.max(capacityRate,1));qDot=effectiveness*capacityRate*usableDelta;}
      else qDot=(radiator.ua||0)*.08*usableDelta;
      qDot=Math.min(Math.max(0,radiator.ratedCapacity??40000),Math.max(0,qDot));
      const waterCapacity=Math.max(1,radiator.waterMass*WATER_CP),waterHeadroomW=waterCapacity*Math.max(0,radiator.waterTemperature-(airIn+approach))/Math.max(dt,1e-6);
      qDot=Math.min(qDot,waterHeadroomW);
      const airLimit=outdoor?Infinity:Math.max(0,totalAirCapacity*((airIn+approach)-airIn)/Math.max(dt,1e-6));
      const waterAirCapacity=Math.max(1,totalAirCapacity),qEq=outdoor?Infinity:usableDelta/(1/waterCapacity+1/waterAirCapacity),q=Math.max(0,Math.min(Math.min(qDot,airLimit)*dt,qEq));
      if(q<=0)continue;
      radiator.energy-=q;
      if(outdoor){world.environment.energyReceived+=q;this.metrics.externalEnergy=(this.metrics.externalEnergy||0)+q;radiator.rejectedToExterior=true;}
      else{for(const cell of cells)world.energy[cell.index]+=q*(cell.weight/weightSum);radiator.rejectedToExterior=false;}
      this.recordTransfer(radiator,q,dt);radiator.airOutTemperature=outdoor?airIn:airIn+q/Math.max(totalAirCapacity,1);
    }
  }
}
