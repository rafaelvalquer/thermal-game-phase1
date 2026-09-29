import { isPowered } from './PowerState.js';
import { clamp } from '../utils/MathUtils.js';
import { SimulationConfig as C } from './SimulationConfig.js';
import { AIR_FACE_AREA } from './air/AirConstants.js';
import { ThermalTopologyCache } from './thermal/ThermalTopologyCache.js';

export class ThermalSystem {
  constructor(world, metrics){this.world=world;this.metrics=metrics;this.topology=new ThermalTopologyCache(world);}
  set monitor(value){this._monitor=value;this.topology.monitor=value;}
  get monitor(){return this._monitor||null;}
  heatMachines(){return this.world.heatMachines;}
  update(dt,elapsed){this.applyHeatSources(dt,elapsed);this.conduct(dt);this.exchangeMachines(dt);this.passiveOutdoorExchange(dt);}

  applyHeatSources(dt,elapsed){
    for(const m of this.heatMachines()){
      m.started=isPowered(m)&&elapsed>=(m.startAt??10);m.coolingPower=0;
      m.heatGenerationPower=m.started?m.heatOutput*(m.loadMultiplier??1):0;
      m.thermalBalance=-m.heatGenerationPower;if(!m.started)continue;
      const q=m.heatGenerationPower*dt;m.energy+=q;this.metrics.generatedHeat+=q;
    }
    for(const source of this.world.passiveHeatSources){
      source.started=isPowered(source)&&elapsed>=(source.startAt??0);if(!source.started)continue;
      const cells=[];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const x=source.x+dx,y=source.y+dy;if(this.world.inBounds(x,y)&&this.world.isAir(x,y))cells.push({x,y});
      }
      if(!cells.length)continue;
      const q=source.heatOutput*dt,share=q/cells.length;for(const c of cells)this.world.addEnergyAt(c.x,c.y,share);
      this.metrics.generatedHeat+=q;
    }
  }

  conduct(dt){
    const w=this.world;this.monitor?.begin?.('thermalConductMs');this.topology.ensureCurrent();w.nextEnergy.set(w.energy);w.heatFlux.fill(0);
    for(const {a,b,conductance} of this.topology.edges){
      const Ta=w.temperatureAtIndex(a),Tb=w.temperatureAtIndex(b),dT=Ta-Tb;if(Math.abs(dT)<1e-7)continue;
      let q=conductance*dT*dt;
      const ca=w.capacityAtIndex(a),cb=w.capacityAtIndex(b),qEq=Math.abs(dT)/(1/ca+1/cb);
      q=clamp(q,-qEq*C.maxConductionEqualizationFraction,qEq*C.maxConductionEqualizationFraction);
      w.nextEnergy[a]-=q;w.nextEnergy[b]+=q;w.heatFlux[a]+=Math.abs(q/dt);w.heatFlux[b]+=Math.abs(q/dt);
    }
    w.energy.set(w.nextEnergy);
    this.monitor?.end?.('thermalConductMs');
  }

  exchangeMachines(dt){for(const m of this.heatMachines()){
    m.type==='serverRack'?this.exchangeServerRack(m,dt):this.exchangeGenericMachine(m,dt);
    m.thermalBalance=m.coolingPower-m.heatGenerationPower;
  }}

  exchangeGenericMachine(m,dt){
    const w=this.world,cells=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(dx===0&&dy===0)continue;const x=m.x+dx,y=m.y+dy;if(w.inBounds(x,y)&&w.isAir(x,y))cells.push(w.index(x,y));}
    if(!cells.length)return;
    const Cm=m.mass*m.heatCapacity,avgSpeed=cells.reduce((sum,i)=>sum+Math.hypot(w.airX[i],w.airY[i]),0)/cells.length,totalUA=C.machinePassiveUA+C.machineForcedUAperMS*avgSpeed;
    for(const i of cells){
      const Ta=w.temperatureAtIndex(i),Tm=m.temperature,Ca=w.capacityAtIndex(i),dT=Tm-Ta;if(Math.abs(dT)<1e-5)continue;
      let q=totalUA*dT*dt/cells.length;const qEq=Math.abs(dT)/(1/Cm+1/Ca);q=clamp(q,-qEq*.35,qEq*.35);m.energy-=q;w.energy[i]+=q;m.coolingPower+=q/dt;
    }
  }

  exchangeServerRack(m,dt){
    const w=this.world,intake={x:m.x+m.airIntakeDirection.x,y:m.y+m.airIntakeDirection.y},exhaust={x:m.x+m.airExhaustDirection.x,y:m.y+m.airExhaustDirection.y};
    const intakeOk=w.inBounds(intake.x,intake.y)&&w.isAir(intake.x,intake.y),exhaustOk=w.inBounds(exhaust.x,exhaust.y)&&w.isAir(exhaust.x,exhaust.y);
    m.intakeFaceBlocked=!intakeOk;m.exhaustFaceBlocked=!exhaustOk;
    m.intakeAirTemperature=intakeOk?w.temperatureAt(intake.x,intake.y):null;
    m.exhaustAirTemperature=exhaustOk?w.temperatureAt(exhaust.x,exhaust.y):null;
    const intakeIndex=intakeOk?w.index(intake.x,intake.y):-1,exhaustIndex=exhaustOk?w.index(exhaust.x,exhaust.y):-1;
    const intakeDirection=m.airIntakeDirection||{x:0,y:-1},exhaustDirection=m.airExhaustDirection||{x:-intakeDirection.x,y:-intakeDirection.y};
    const intakeVelocity=intakeOk?-(w.airX[intakeIndex]*intakeDirection.x+w.airY[intakeIndex]*intakeDirection.y):0;
    const exhaustVelocity=exhaustOk?w.airX[exhaustIndex]*exhaustDirection.x+w.airY[exhaustIndex]*exhaustDirection.y:0;
    m.intakeAirVelocity=intakeVelocity;
    m.intakeAirFlow=Math.max(0,intakeVelocity)*AIR_FACE_AREA;
    m.exhaustAirVelocity=exhaustVelocity;
    m.exhaustAirFlow=Math.max(0,exhaustVelocity)*AIR_FACE_AREA;
    if(!intakeOk&&!exhaustOk)return;
    const inletIndex=intakeOk?intakeIndex:exhaustIndex,outIndex=exhaustOk?exhaustIndex:inletIndex;
    const Tin=w.temperatureAtIndex(inletIndex),Cm=m.mass*m.heatCapacity,Ca=w.capacityAtIndex(outIndex),intakeSpeed=intakeOk?Math.hypot(w.airX[inletIndex],w.airY[inletIndex]):0;
    const staffBoost=m.staffBoostRemaining>0?1.2:1;
    const ua=(C.rackPassiveUA+(C.rackForcedUAperMS*intakeSpeed))*staffBoost,dT=m.temperature-Tin;if(Math.abs(dT)<1e-5)return;
    let q=ua*dT*dt;const qEq=Math.abs(dT)/(1/Cm+1/Ca),equalizationLimit=qEq*(staffBoost>1?.54:.45);q=clamp(q,-equalizationLimit,equalizationLimit);m.energy-=q;w.energy[outIndex]+=q;m.coolingPower+=q/dt;
  }

  passiveOutdoorExchange(dt){
    const w=this.world,out=w.environment.temperature;
    for(let x=0;x<w.width;x++){this.exchangeBoundary(w.index(x,0),dt,out);this.exchangeBoundary(w.index(x,w.height-1),dt,out);}
    for(let y=1;y<w.height-1;y++){this.exchangeBoundary(w.index(0,y),dt,out);this.exchangeBoundary(w.index(w.width-1,y),dt,out);}
  }
  exchangeBoundary(i,dt,out){
    const w=this.world;if(!w.isAirIndex(i))return;
    const T=w.temperatureAtIndex(i),q=C.passiveOutdoorLeakWPerK*(T-out)*dt;w.energy[i]-=q;w.environment.energyReceived+=q;this.metrics.externalEnergy+=q;
  }
}
