import { HVAC } from './HVACConstants.js';
import { DuctNetworkBuilder } from './DuctNetworkBuilder.js';
import { DuctFlowSolver } from './DuctFlowSolver.js';
import { DuctThermalSolver } from './DuctThermalSolver.js';
import { HVACAirExchange } from './HVACAirExchange.js';
import { HVACDiagnostics } from './HVACDiagnostics.js';
import { RefrigerantNetworkBuilder } from './refrigerant/RefrigerantNetworkBuilder.js';
import { RefrigerantSolver } from './refrigerant/RefrigerantSolver.js';
import { RefrigerantDiagnostics } from './refrigerant/RefrigerantDiagnostics.js';
import { HVACEnergyBalance } from './HVACEnergyBalance.js';
import { clamp } from '../../utils/MathUtils.js';

export class HVACSystem {
  constructor(world,airflow,metrics){
    this.world=world;this.airflow=airflow;this.metrics=metrics;
    this.builder=new DuctNetworkBuilder(world);this.flow=new DuctFlowSolver(world);
    this.refrigerantBuilder=new RefrigerantNetworkBuilder(world);this.refrigerantSolver=new RefrigerantSolver();
    this.thermal=new DuctThermalSolver(world);this.exchange=new HVACAirExchange(world,airflow);
    this.diagnostics=new HVACDiagnostics();this.refrigerantDiagnostics=new RefrigerantDiagnostics();this.energyBalance=new HVACEnergyBalance();
    this.networks=[];this.refrigerantCircuits=[];this.handlers=[];this.condensers=[];this.momentumSources=[];this.pendingReject=[];
    metrics.hvacCooling=0;metrics.hvacElectricalPower=0;metrics.hvacHeatRejected=0;
  }

  update(dt){
    this.networks=this.builder.build();this.refrigerantCircuits=this.refrigerantBuilder.build();this.world.hvac=this;
    this.handlers=this.world.entitiesByType('airHandler');this.condensers=this.world.entitiesByType('condenser');
    this.metrics.hvacCooling=0;this.metrics.hvacElectricalPower=0;this.metrics.hvacHeatRejected=0;
    this.momentumSources=[];this.pendingReject=[];
    for(const condenser of this.condensers){condenser.heatRejected=0;condenser.electricalPower=0;condenser.compressorPower=0;condenser.condenserFanPower=0;condenser.power=0;condenser.coolingLoad=0;condenser.status=condenser.refrigerantCircuitId?condenser.circuitStatus:'DISCONNECTED';}
    for(const network of this.networks)if(network.role==='supply'||network.role==='return')this.flow.solve(network);
    for(const handler of this.handlers)this.prepareHandler(handler);
    this.metrics.hvacDiagnostics=this.diagnostics.update(this.networks,this.handlers,this.condensers,this.world.hvacZonePressure,this.refrigerantCircuits);
    this.metrics.refrigerantDiagnostics=this.refrigerantDiagnostics.update(this.refrigerantCircuits);
  }

  refrigerantCircuitFor(handler){return this.refrigerantBuilder.circuitFor(handler);}
  refrigerantCircuitById(id){return this.refrigerantCircuits.find(circuit=>circuit.id===id)||null;}

  prepareCondenser(handler,condenser){
    if(!condenser)return;
    condenser.indoor=(this.world.zones||[]).some(zone=>condenser.x>=zone.x&&condenser.y>=zone.y&&condenser.x<zone.x+zone.width&&condenser.y<zone.y+zone.height);
    condenser.outdoorTemperature=condenser.indoor?this.world.temperatureAt(condenser.x,condenser.y):this.world.environment.temperature;
  }

  prepareHandler(handler){
    const related=this.networks.filter(network=>network.airHandlers.includes(handler));
    const invalid=related.find(network=>network.status==='SUPPLY / RETURN CROSS-CONNECTION'||network.status==='MULTIPLE AIR HANDLERS');
    const supply=related.filter(network=>network.role==='supply'),returns=related.filter(network=>network.role==='return');
    const supplyFlow=supply.reduce((sum,network)=>sum+network.flowRate,0),returnFlow=returns.reduce((sum,network)=>sum+network.flowRate,0);
    const hasReturnVent=returns.some(network=>network.vents.length>0);
    handler.supplyAvailableFlow=supply.reduce((sum,network)=>sum+(network.designFlowRate||network.flowRate),0);
    handler.returnAvailableFlow=returns.reduce((sum,network)=>sum+(network.designFlowRate||network.flowRate),0);
    handler.flowImbalance=hasReturnVent?supplyFlow-returnFlow:0;
    const refrigerant=this.refrigerantCircuitFor(handler),condenser=refrigerant?.condensers.length===1?refrigerant.condensers[0]:null;
    handler.condenserId=condenser?.id||null;handler.refrigerantCircuitId=refrigerant?.id||null;
    this.prepareCondenser(handler,condenser);
    let status='READY';
    if(!handler.enabled)status='OFF';
    else if(invalid)status=invalid.status;
    else if(!supply.length)status='NO SUPPLY NETWORK';
    else if(!supply.some(network=>network.vents.length))status='NO SUPPLY VENT';
    else if(supply.some(network=>network.status!=='READY'))status=supply.find(network=>network.status!=='READY').status;
    else if(!hasReturnVent)status='NO RETURN NETWORK';
    else if(returns.some(network=>network.status!=='READY'))status=returns.find(network=>network.status!=='READY').status;
    else if(!refrigerant)status='NO REFRIGERANT LINE';
    else if(refrigerant.status==='NO CONDENSER'||refrigerant.status==='NO AIR HANDLER')status='NO CONDENSER';
    else if(refrigerant.status!=='READY')status='REFRIGERANT CIRCUIT INVALID';
    else if(!condenser||!condenser.enabled)status='NO CONDENSER';

    const target=handler.enabled&&status==='READY'?Math.min(supplyFlow,returnFlow,handler.maxAirFlow):0;
    handler.currentFlow=target;handler.supplyFlow=target;handler.returnFlow=hasReturnVent?target:0;
    handler.supplyPressure=Math.max(0,...supply.map(network=>network.pressure));
    handler.returnPressure=-Math.max(0,...returns.map(network=>network.pressure));
    for(const [list,total] of [[supply,supplyFlow],[returns,returnFlow]])if(total>0){const factor=target/total;for(const network of list)this.scaleNetwork(network,factor);}
    for(const network of supply)for(const path of network.paths)if(path.flowRate>0)this.momentumSources.push({vent:path.vent,kind:'supply'});
    for(const network of returns)for(const path of network.paths)if(path.flowRate>0)this.momentumSources.push({vent:path.vent,kind:'return'});
    handler.status=status;
  }

  scaleNetwork(network,factor){
    network.flowRate*=factor;network.pressure*=factor*factor;
    for(const duct of network.ducts){duct.flowRate=0;duct.pressure=0;duct.pressureLoss=0;duct.direction={x:0,y:0};duct.upstreamId=null;duct.downstreamId=null;duct._pressureWeight=0;}
    for(const path of network.paths){
      path.flowRate*=factor;path.pressureDrop=Number.isFinite(path.resistance)?path.resistance*path.flowRate*path.flowRate:0;path.vent.flowRate=path.flowRate;
      path.vent.pressure=(network.role==='supply'?1:-1)*path.pressureDrop;
      const ductCount=path.path.filter(item=>item.kind==='duct').length;let ductIndex=0;
      for(let i=0;i<path.path.length;i++){
        const node=path.path[i];if(node.kind!=='duct')continue;
        const duct=node.entity;duct.flowRate+=path.flowRate;
        const fraction=(ductIndex+1)/(ductCount+1),staticPressure=network.role==='supply'?path.pressureDrop*(1-fraction):-path.pressureDrop*fraction;
        duct.pressure+=staticPressure*path.flowRate;duct._pressureWeight+=path.flowRate;
        duct.pressureLoss+=ductCount?path.pressureDrop/ductCount:0;
        const next=path.path.slice(i+1).find(item=>item.kind!=='duct'),prev=path.path.slice(0,i).reverse().find(item=>item.kind!=='duct');
        duct.upstreamId=prev?.entity.handler?.id||prev?.entity.id||null;duct.downstreamId=next?.entity.handler?.id||next?.entity.id||null;
        if(next)duct.direction={x:Math.sign(next.entity.x-duct.x),y:Math.sign(next.entity.y-duct.y)};
        duct.velocity=duct.flowRate/Math.max(duct.crossSectionArea,.001);ductIndex++;
      }
    }
    for(const duct of network.ducts){if(duct._pressureWeight>0)duct.pressure/=duct._pressureWeight;delete duct._pressureWeight;}
  }

  matchNetworks(){for(const handler of this.handlers)this.prepareHandler(handler);}

  exchangeRooms(dt){
    this.updateZonePressures(dt);this.exchange.applyMomentum(this.momentumSources,dt);this.thermal.beginStep();
    this.metrics.hvacCooling=0;this.metrics.hvacElectricalPower=0;this.metrics.hvacHeatRejected=0;
    for(const handler of this.handlers)this.solveHandler(handler,dt);
    this.thermal.commitTemperatures();
    this.metrics.hvacDiagnostics=this.diagnostics.update(this.networks,this.handlers,this.condensers,this.world.hvacZonePressure,this.refrigerantCircuits);
    this.metrics.hvacEnergyBalance=this.energyBalance.calculate({
      roomCooling:this.handlers.reduce((sum,handler)=>sum+(handler.actualRoomCooling||0),0),
      ductHeatTransfer:this.allDucts().reduce((sum,duct)=>sum+(duct.thermalPower||0),0),
      evaporatorCooling:this.handlers.reduce((sum,handler)=>sum+(handler.coolingPower||0),0),
      compressorPower:this.handlers.reduce((sum,handler)=>sum+(handler.compressorPower||0),0),
      airHandlerFanPower:this.handlers.reduce((sum,handler)=>sum+(handler.power||0),0),
      condenserFanPower:this.condensers.reduce((sum,condenser)=>sum+(condenser.coolingLoad>0?condenser.fanPower:0),0),
      heatRejected:this.condensers.reduce((sum,condenser)=>sum+(condenser.heatRejected||0),0),
    });
  }

  updateZonePressures(dt){
    const zones=this.world.zones||[],flows=new Map(zones.map(zone=>[zone.id,{supply:0,returns:0}]));
    for(const network of this.networks)for(const path of network.paths){
      const zone=zones.find(item=>path.vent.x>=item.x&&path.vent.y>=item.y&&path.vent.x<item.x+item.width&&path.vent.y<item.y+item.height);
      if(!zone)continue;const entry=flows.get(zone.id),q=path.designFlowRate??path.flowRate;
      if(network.role==='supply')entry.supply+=q;else if(network.role==='return')entry.returns+=q;
    }
    const alpha=1-Math.exp(-Math.max(0,dt)*.8);
    for(const zone of zones){const {supply,returns}=flows.get(zone.id),target=clamp((supply-returns)*20,-60,60),old=this.world.hvacZonePressure.get(zone.id)||0;this.world.hvacZonePressure.set(zone.id,old+(target-old)*alpha);}
  }

  solveHandler(handler,dt){
    handler.actualRoomCooling=0;let roomExchangePower=0;
    const supply=this.networks.filter(network=>network.role==='supply'&&network.airHandlers.includes(handler));
    const returns=this.networks.filter(network=>network.role==='return'&&network.airHandlers.includes(handler));
    const returnPaths=returns.flatMap(network=>network.paths).filter(path=>path.flowRate>0);
    let returnMass=0,returnWeighted=0;
    for(const path of returnPaths){
      const roomTemperature=this.exchange.returnTemperature(path.vent),ductTemperature=this.thermal.solvePath(path.path,path.flowRate,roomTemperature,dt);
      path.vent.airTemperature=roomTemperature;this.exchange.applyReturn(path.vent,dt);returnMass+=path.flowRate;returnWeighted+=ductTemperature*path.flowRate;
    }
    handler.returnTemperature=returnMass?returnWeighted/returnMass:this.world.environment.temperature;
    const massFlow=handler.currentFlow*HVAC.airDensity,delta=Math.max(0,handler.returnTemperature-handler.targetSupplyTemperature);
    handler.coolingDemand=massFlow*HVAC.airCp*delta;
    const circuit=this.refrigerantCircuitFor(handler),condenser=circuit?.status==='READY'&&circuit.condensers.length===1?circuit.condensers[0]:null;
    const result=this.refrigerantSolver.solve({handler,condenser,circuit,coolingDemand:handler.coolingDemand,evaporatorCapacity:handler.evaporatorUA*delta});
    handler.coolingPower=result.cooling;handler.compressorPower=result.compressorPower;handler.cop=result.cop;
    handler.refrigerantCapacityFactor=result.capacityFactor;handler.refrigerantCapacity=result.capacity;
    handler.supplyTemperature=massFlow>0?handler.returnTemperature-handler.coolingPower/(massFlow*HVAC.airCp):handler.returnTemperature;
    const flowFraction=handler.maxAirFlow>0?clamp(handler.currentFlow/handler.maxAirFlow,0,1):0;
    handler.power=handler.enabled&&handler.currentFlow>0?handler.fanPower*Math.max(.3,flowFraction**3):0;
    if(condenser){
      condenser.coolingLoad=handler.coolingPower;condenser.compressorPower=result.compressorPower;condenser.condenserFanPower=result.condenserFanPower;
      condenser.electricalPower=result.compressorPower+result.condenserFanPower;
      condenser.heatRejected=result.heatRejected;condenser.power=condenser.electricalPower;condenser.availableCapacity=result.rejectedHeatCapacity;
      const loadRatio=condenser.availableCapacity>0?condenser.heatRejected/condenser.availableCapacity:0;
      condenser.status=!handler.currentFlow?'IDLE':loadRatio>=.85&&condenser.outdoorTemperature>=35?'HIGH HEAD':loadRatio>=.85?'HIGH LOAD':'READY';
      this.pendingReject.push({handler,condenser});
    }
    for(const network of supply)for(const path of network.paths){
      if(path.flowRate<=0){path.vent.airTemperature=handler.supplyTemperature;path.vent.coolingDelivered=0;continue;}
      path.vent.airTemperature=this.thermal.solvePath(path.path,path.flowRate,handler.supplyTemperature,dt);
      path.vent.dischargeVelocity=path.flowRate/Math.max(.01,path.vent.area||.08);
      path.vent.coolingDelivered=HVAC.airDensity*HVAC.airCp*path.flowRate*Math.max(0,handler.returnTemperature-path.vent.airTemperature);
      roomExchangePower+=this.exchange.applySupply(path.vent,dt);
    }
    handler.actualRoomCooling=Math.max(0,-roomExchangePower);
    if(handler.status==='READY'){
      if(handler.currentFlow<=0)handler.status='NO SUPPLY NETWORK';
      else if(handler.coolingPower+1<handler.coolingDemand)handler.status='OVERLOAD';
    }
    this.metrics.hvacCooling+=handler.coolingPower;this.metrics.hvacElectricalPower+=handler.power+(condenser?.power||0);
  }

  rejectHeat(dt){
    for(const {handler,condenser} of this.pendingReject){
      if(!condenser.enabled||!handler.enabled||!handler.currentFlow)continue;
      const energy=condenser.heatRejected*dt;this.metrics.generatedHeat+=condenser.electricalPower*dt;
      if(condenser.indoor&&this.world.isAir(condenser.x,condenser.y))this.world.addEnergyAt(condenser.x,condenser.y,energy);
      else{this.world.environment.energyReceived+=energy;this.metrics.externalEnergy+=energy;}
      this.metrics.hvacHeatRejected+=condenser.heatRejected;
    }
  }

  allDucts(){return this.world.allUtilities().filter(entity=>HVAC.ductTypes.has(entity.type));}
}
