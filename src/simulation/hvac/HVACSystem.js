import { HVAC } from './HVACConstants.js';
import { DuctNetworkBuilder } from './DuctNetworkBuilder.js';
import { DuctFlowSolver } from './DuctFlowSolver.js';
import { DuctThermalSolver } from './DuctThermalSolver.js';
import { HVACAirExchange } from './HVACAirExchange.js';
import { HVACDiagnostics } from './HVACDiagnostics.js';
import { clamp } from '../../utils/MathUtils.js';

export class HVACSystem {
  constructor(world,airflow,metrics){
    this.world=world;this.airflow=airflow;this.metrics=metrics;
    this.builder=new DuctNetworkBuilder(world);this.flow=new DuctFlowSolver(world);
    this.thermal=new DuctThermalSolver(world);this.exchange=new HVACAirExchange(world,airflow);
    this.diagnostics=new HVACDiagnostics();this.networks=[];this.handlers=[];this.condensers=[];
    this.momentumSources=[];this.pendingReject=[];
    metrics.hvacCooling=0;metrics.hvacElectricalPower=0;metrics.hvacHeatRejected=0;
  }

  update(dt){
    this.networks=this.builder.build();
    this.world.hvac=this;
    this.handlers=this.world.entitiesByType('airHandler');this.condensers=this.world.entitiesByType('condenser');
    this.metrics.hvacCooling=0;this.metrics.hvacElectricalPower=0;this.metrics.hvacHeatRejected=0;
    this.momentumSources=[];this.pendingReject=[];
    for(const condenser of this.condensers){condenser.heatRejected=0;condenser.electricalPower=0;condenser.power=0;condenser.airHandlerId=null;}
    for(const network of this.networks)this.flow.solve(network);
    for(const handler of this.handlers)this.prepareHandler(handler,dt);
    this.matchNetworks();
  }

  prepareHandler(handler,dt){
    handler.networkIds=this.networks.filter(network=>network.airHandlers.includes(handler)).map(network=>network.id);
    const supply=this.networks.filter(network=>network.role==='supply'&&network.airHandlers.includes(handler));
    const returns=this.networks.filter(network=>network.role==='return'&&network.airHandlers.includes(handler));
    const supplyFlow=supply.reduce((sum,network)=>sum+network.flowRate,0);
    const returnFlow=returns.reduce((sum,network)=>sum+network.flowRate,0);
    handler.supplyAvailableFlow=supplyFlow;handler.returnAvailableFlow=returnFlow;
    handler.flowImbalance=returns.some(network=>network.vents.length)?supplyFlow-returnFlow:0;
    handler.currentFlow=handler.enabled?Math.min(supplyFlow,returns.some(network=>network.vents.length)?returnFlow:supplyFlow,handler.maxAirFlow):0;
    const condenser=this.findCondenser(handler);handler.condenserId=condenser?.id||null;
    const hasSupply=supply.some(network=>network.paths.some(path=>path.flowRate>0));
    if(!handler.enabled)handler.status='OFF';
    else if(!hasSupply)handler.status=supply.some(network=>network.status==='NO SUPPLY VENT')?'NO SUPPLY VENT':'NO SUPPLY NETWORK';
    else if(!condenser)handler.status='NO CONDENSER';
    else handler.status=returns.some(network=>network.vents.length)?'READY':'DIRECT ROOM RETURN';
    for(const network of [...supply,...returns]){
      const groupFlow=network.role==='supply'?supplyFlow:returnFlow;
      const target=network.role==='supply'?handler.currentFlow:handler.currentFlow;
      const factor=groupFlow>0?target/groupFlow:0;
      this.scaleNetwork(network,factor);
    }
    if(!returns.some(network=>network.vents.length)&&handler.currentFlow>0){
      for(const network of supply)for(const path of network.paths)this.momentumSources.push({vent:path.vent,kind:'supply'});
      this.momentumSources.push({vent:handler,kind:'return'});
    }
    this.prepareCondenser(handler,condenser);
  }

  findCondenser(handler){
    return this.condensers.filter(condenser=>condenser.enabled&&(!condenser.airHandlerId||condenser.airHandlerId===handler.id)&&Math.abs(condenser.x-handler.x)+Math.abs(condenser.y-handler.y)<=HVAC.maxCondenserDistance)
      .sort((a,b)=>(Math.abs(a.x-handler.x)+Math.abs(a.y-handler.y))-(Math.abs(b.x-handler.x)+Math.abs(b.y-handler.y)))[0]||null;
  }

  prepareCondenser(handler,condenser){
    if(!condenser)return;
    condenser.airHandlerId=handler.id;
    condenser.indoor=(this.world.zones||[]).some(zone=>condenser.x>=zone.x&&condenser.y>=zone.y&&condenser.x<zone.x+zone.width&&condenser.y<zone.y+zone.height);
    condenser.outdoorTemperature=this.world.environment.temperature;
  }

  scaleNetwork(network,factor){
    network.flowRate*=factor;
    network.pressure*=factor*factor;
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
        const next=path.path.slice(i+1).find(item=>item.kind==='duct'||item.kind==='terminal');
        const prev=path.path.slice(0,i).reverse().find(item=>item.kind==='duct'||item.kind==='terminal');
        duct.upstreamId=prev?.entity.id||null;duct.downstreamId=next?.entity.id||null;
        if(next)duct.direction={x:Math.sign(next.entity.x-duct.x),y:Math.sign(next.entity.y-duct.y)};
        duct.velocity=duct.flowRate/Math.max(duct.crossSectionArea,.001);
        ductIndex++;
      }
    }
    for(const duct of network.ducts){if(duct._pressureWeight>0)duct.pressure/=duct._pressureWeight;delete duct._pressureWeight;}
  }

  matchNetworks(){
    for(const handler of this.handlers){
      const supply=this.networks.filter(network=>network.role==='supply'&&network.airHandlers.includes(handler));
      const returns=this.networks.filter(network=>network.role==='return'&&network.airHandlers.includes(handler));
      const supplySum=supply.reduce((sum,network)=>sum+network.flowRate,0),returnSum=returns.reduce((sum,network)=>sum+network.flowRate,0);
      const balanced=Math.min(supplySum,returns.some(network=>network.vents.length)?returnSum:supplySum,handler.maxAirFlow);
      for(const network of supply)if(supplySum>0)this.scaleNetwork(network,balanced/supplySum);
      for(const network of returns)if(returnSum>0)this.scaleNetwork(network,balanced/returnSum);
      handler.currentFlow=handler.enabled?balanced:0;
      handler.supplyFlow=handler.currentFlow;handler.returnFlow=handler.currentFlow;
      handler.supplyPressure=Math.max(0,...supply.map(network=>network.pressure));
      handler.returnPressure=-Math.max(0,...returns.map(network=>network.pressure));
      for(const network of supply)for(const path of network.paths)if(path.flowRate>0)this.momentumSources.push({vent:path.vent,kind:'supply'});
      for(const network of returns)for(const path of network.paths)if(path.flowRate>0)this.momentumSources.push({vent:path.vent,kind:'return'});
    }
  }

  exchangeRooms(dt){
    this.metrics.hvacCooling=0;this.metrics.hvacElectricalPower=0;
    this.updateZonePressures(dt);
    this.exchange.applyMomentum(this.momentumSources,dt);
    this.thermal.beginStep();
    for(const handler of this.handlers)this.solveHandler(handler,dt);
    this.thermal.commitTemperatures();
    this.metrics.hvacDiagnostics=this.diagnostics.update(this.networks,this.handlers,this.condensers,this.world.hvacZonePressure);
  }

  updateZonePressures(dt){
    const zones=this.world.zones||[],flows=new Map(zones.map(zone=>[zone.id,{supply:0,returns:0}]));
    for(const network of this.networks)for(const path of network.paths){
      const zone=zones.find(item=>path.vent.x>=item.x&&path.vent.y>=item.y&&path.vent.x<item.x+item.width&&path.vent.y<item.y+item.height);
      if(!zone)continue;
      const entry=flows.get(zone.id),q=path.designFlowRate??path.flowRate;
      if(network.role==='supply')entry.supply+=q;else entry.returns+=q;
    }
    for(const handler of this.handlers){
      const hasReturn=(this.networks||[]).some(network=>network.role==='return'&&network.airHandlers.includes(handler)&&network.vents.length);
      if(hasReturn)continue;
      const zone=zones.find(item=>handler.x>=item.x&&handler.y>=item.y&&handler.x<item.x+item.width&&handler.y<item.y+item.height);
      if(zone)flows.get(zone.id).returns+=this.networks.filter(network=>network.role==='supply'&&network.airHandlers.includes(handler))
        .reduce((sum,network)=>sum+(network.designFlowRate??network.flowRate),0);
    }
    const alpha=1-Math.exp(-Math.max(0,dt)*.8);
    for(const zone of zones){
      const {supply,returns}=flows.get(zone.id),target=clamp((supply-returns)*20,-60,60);
      const pressure=(this.world.hvacZonePressure.get(zone.id)||0)+(target-(this.world.hvacZonePressure.get(zone.id)||0))*alpha;
      this.world.hvacZonePressure.set(zone.id,pressure);
    }
  }

  solveHandler(handler,dt){
    handler.actualRoomCooling=0;
    let roomExchangePower=0;
    const supply=this.networks.filter(network=>network.role==='supply'&&network.airHandlers.includes(handler));
    const returns=this.networks.filter(network=>network.role==='return'&&network.airHandlers.includes(handler));
    const supplyPaths=supply.flatMap(network=>network.paths).filter(path=>path.flowRate>0);
    const supplyReferenceFlow=supplyPaths.reduce((sum,path)=>sum+path.flowRate,0);
    if(supplyReferenceFlow>0)this.exchange.setRoomReferenceTemperature(
      supplyPaths.reduce((sum,path)=>sum+this.world.temperatureAt(path.vent.x,path.vent.y)*path.flowRate,0)/supplyReferenceFlow
    );
    const returnPaths=returns.flatMap(network=>network.paths).filter(path=>path.flowRate>0);
    let returnMass=0,returnWeighted=0;
    for(const path of returnPaths){
      const roomT=this.exchange.returnTemperature(path.vent),ductT=this.thermal.solvePath(path.path,path.flowRate,roomT,dt);
      path.vent.airTemperature=roomT;roomExchangePower+=this.exchange.applyReturn(path.vent,dt);returnMass+=path.flowRate;returnWeighted+=ductT*path.flowRate;
    }
    if(!returnPaths.length&&handler.currentFlow>0){
      handler.flowRate=handler.currentFlow;handler.airTemperature=this.exchange.fallbackReturnTemperature(handler);
      roomExchangePower+=this.exchange.applyReturn(handler,dt);returnMass=handler.currentFlow;returnWeighted=handler.airTemperature*handler.currentFlow;
    }
    handler.returnTemperature=returnMass?returnWeighted/returnMass:this.exchange.fallbackReturnTemperature(handler);
    const massFlow=handler.currentFlow*HVAC.airDensity,delta=Math.max(0,handler.returnTemperature-handler.targetSupplyTemperature);
    handler.coolingDemand=massFlow*HVAC.airCp*delta;
    const condenser=this.condensers.find(item=>item.id===handler.condenserId);
    const outdoorRise=condenser?Math.max(0,condenser.outdoorTemperature-25):0;
    const cop=condenser?clamp(condenser.cop-outdoorRise*.06,1.2,condenser.cop):1;
    const condenserCapacity=condenser?Math.max(0,condenser.coolingCapacity*clamp(1-outdoorRise*.015,.45,1)-condenser.fanPower):0;
    if(condenser)condenser.availableCapacity=condenserCapacity+condenser.fanPower;
    const condenserLimited=condenser?condenserCapacity/(1+1/cop):0;
    const evaporatorLimit=handler.evaporatorUA*delta;
    handler.coolingPower=handler.enabled&&handler.currentFlow>0&&condenser?Math.min(handler.coolingDemand,handler.coolingCapacity,condenserLimited,evaporatorLimit):0;
    handler.compressorPower=handler.coolingPower/cop;handler.cop=cop;
    handler.supplyTemperature=massFlow>0?handler.returnTemperature-handler.coolingPower/(massFlow*HVAC.airCp):handler.returnTemperature;
    if(!condenser&&handler.status!=='OFF'&&handler.status!=='NO SUPPLY VENT'&&handler.status!=='NO SUPPLY NETWORK')handler.status='NO CONDENSER';
    else if(condenser&&handler.currentFlow>0&&handler.coolingPower+1<handler.coolingDemand){handler.status='OVERLOAD';}
    else if(condenser&&handler.currentFlow>0&&handler.status!=='DIRECT ROOM RETURN')handler.status='READY';
    const flowFraction=handler.maxAirFlow>0?clamp(handler.currentFlow/handler.maxAirFlow,0,1):0;
    handler.power=handler.enabled&&handler.currentFlow>0?handler.fanPower*Math.max(.3,flowFraction**3):0;
    if(condenser){
      condenser.electricalPower=handler.enabled&&handler.currentFlow>0?handler.compressorPower+(condenser.enabled?condenser.fanPower:0):0;
      condenser.heatRejected=handler.coolingPower+condenser.electricalPower;
      condenser.power=condenser.enabled?condenser.electricalPower:0;
      const loadRatio=condenser.availableCapacity>0?condenser.heatRejected/condenser.availableCapacity:0;
      condenser.status=!handler.currentFlow?'IDLE':loadRatio>=.85&&condenser.outdoorTemperature>=35?'HIGH HEAD':loadRatio>=.85?'HIGH LOAD':'READY';
      this.pendingReject.push({handler,condenser});
    }
    for(const network of supply)for(const path of network.paths){
      if(path.flowRate<=0){path.vent.airTemperature=handler.supplyTemperature;continue;}
      path.vent.airTemperature=this.thermal.solvePath(path.path, path.flowRate,handler.supplyTemperature,dt);
      path.vent.dischargeVelocity=path.flowRate/Math.max(.01,path.vent.area||.08);
      path.vent.coolingDelivered=Math.max(0,HVAC.airDensity*HVAC.airCp*path.flowRate*(path.vent.airTemperature-this.exchange.returnTemperature(path.vent)));
      roomExchangePower+=this.exchange.applySupply(path.vent,dt);
    }
    handler.actualRoomCooling=Math.max(0,-roomExchangePower);
    this.metrics.hvacCooling+=handler.coolingPower;
    this.metrics.hvacElectricalPower+=handler.power+(condenser?.power||0);
  }

  rejectHeat(dt){
    for(const {handler,condenser} of this.pendingReject){
      if(!condenser.enabled||!handler.enabled||!handler.currentFlow)continue;
      const energy=condenser.heatRejected*dt;this.metrics.generatedHeat+=(condenser.electricalPower*dt);
      if(condenser.indoor&&this.world.isAir(condenser.x,condenser.y))this.world.addEnergyAt(condenser.x,condenser.y,energy);
      else{this.world.environment.energyReceived+=energy;this.metrics.externalEnergy+=energy;}
      this.metrics.hvacHeatRejected+=condenser.heatRejected;
    }
  }

  allDucts(){return this.world.allUtilities().filter(entity=>HVAC.ductTypes.has(entity.type));}
}
