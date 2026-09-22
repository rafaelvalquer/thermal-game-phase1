import { TILE_AREA, TILE_SIZE_METERS } from '../utils/Constants.js';
import { harmonicMean, clamp } from '../utils/MathUtils.js';
import { SimulationConfig as C } from './SimulationConfig.js';

export class ThermalSystem {
  constructor(world, metrics){this.world=world;this.metrics=metrics;}
  heatMachines(){return this.world.entities.filter(e=>e.isHeatMachine);}
  update(dt,elapsed){this.applyHeatSources(dt,elapsed);this.conduct(dt);this.exchangeMachines(dt);this.passiveOutdoorExchange(dt);}

  applyHeatSources(dt,elapsed){
    for(const m of this.heatMachines()){
      m.started=m.enabled&&elapsed>=(m.startAt??10);m.coolingPower=0;if(!m.started)continue;
      const q=m.heatOutput*(m.loadMultiplier||1)*dt;m.energy+=q;this.metrics.generatedHeat+=q;
    }
    for(const source of this.world.entities.filter(e=>e.isPassiveHeatSource)){
      source.started=source.enabled&&elapsed>=(source.startAt??0);if(!source.started)continue;
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
    const w=this.world;w.nextEnergy.set(w.energy);w.heatFlux.fill(0);const dirs=[[1,0],[0,1]];
    for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++){
      const i=w.index(x,y),Ti=w.temperatureAtIndex(i),mi=w.registry.fromIndex(w.material[i]);
      for(const [dx,dy] of dirs){
        const nx=x+dx,ny=y+dy;if(!w.inBounds(nx,ny))continue;
        const j=w.index(nx,ny),Tj=w.temperatureAtIndex(j),mj=w.registry.fromIndex(w.material[j]),dT=Ti-Tj;if(Math.abs(dT)<1e-7)continue;
        const k=harmonicMean(mi.conductivity,mj.conductivity);if(k<=0)continue;
        let q=k*TILE_AREA*dT/TILE_SIZE_METERS*dt*C.conductionScale;
        const ci=w.capacityAtIndex(i),cj=w.capacityAtIndex(j),qEq=Math.abs(dT)/(1/ci+1/cj);
        q=clamp(q,-qEq*C.maxConductionEqualizationFraction,qEq*C.maxConductionEqualizationFraction);
        w.nextEnergy[i]-=q;w.nextEnergy[j]+=q;w.heatFlux[i]+=Math.abs(q/dt);w.heatFlux[j]+=Math.abs(q/dt);
      }
    }
    w.energy.set(w.nextEnergy);
  }

  exchangeMachines(dt){for(const m of this.heatMachines())m.type==='serverRack'?this.exchangeServerRack(m,dt):this.exchangeGenericMachine(m,dt);}

  exchangeGenericMachine(m,dt){
    const w=this.world,cells=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(dx===0&&dy===0)continue;const x=m.x+dx,y=m.y+dy;if(w.inBounds(x,y)&&w.isAir(x,y))cells.push(w.index(x,y));}
    if(!cells.length)return;
    const Cm=m.mass*m.heatCapacity,avgSpeed=cells.reduce((sum,i)=>sum+Math.hypot(w.airX[i],w.airY[i]),0)/cells.length,totalUA=C.machinePassiveUA+C.machineForcedUAperMS*avgSpeed;
    for(const i of cells){
      const Ta=w.temperatureAtIndex(i),Tm=m.temperature,Ca=w.capacityAtIndex(i),dT=Tm-Ta;if(Math.abs(dT)<1e-5)continue;
      let q=totalUA*dT*dt/cells.length;const qEq=Math.abs(dT)/(1/Cm+1/Ca);q=clamp(q,-qEq*.35,qEq*.35);m.energy-=q;w.energy[i]+=q;if(q>0)m.coolingPower+=q/dt;
    }
  }

  exchangeServerRack(m,dt){
    const w=this.world,intake={x:m.x+m.airIntakeDirection.x,y:m.y+m.airIntakeDirection.y},exhaust={x:m.x+m.airExhaustDirection.x,y:m.y+m.airExhaustDirection.y};
    const intakeOk=w.inBounds(intake.x,intake.y)&&w.isAir(intake.x,intake.y),exhaustOk=w.inBounds(exhaust.x,exhaust.y)&&w.isAir(exhaust.x,exhaust.y);if(!intakeOk&&!exhaustOk)return;
    const inletIndex=intakeOk?w.index(intake.x,intake.y):w.index(exhaust.x,exhaust.y),outIndex=exhaustOk?w.index(exhaust.x,exhaust.y):inletIndex;
    const Tin=w.temperatureAtIndex(inletIndex),Cm=m.mass*m.heatCapacity,Ca=w.capacityAtIndex(outIndex),intakeSpeed=Math.hypot(w.airX[inletIndex],w.airY[inletIndex]);
    const ua=(C.machinePassiveUA*1.2)+(C.machineForcedUAperMS*1.6*intakeSpeed),dT=m.temperature-Tin;if(Math.abs(dT)<1e-5)return;
    let q=ua*dT*dt;const qEq=Math.abs(dT)/(1/Cm+1/Ca);q=clamp(q,-qEq*.45,qEq*.45);m.energy-=q;w.energy[outIndex]+=q;if(q>0)m.coolingPower+=q/dt;
  }

  passiveOutdoorExchange(dt){
    const w=this.world,out=w.environment.temperature;
    for(let x=0;x<w.width;x++){this.exchangeBoundary(w.index(x,0),dt,out);this.exchangeBoundary(w.index(x,w.height-1),dt,out);}
    for(let y=1;y<w.height-1;y++){this.exchangeBoundary(w.index(0,y),dt,out);this.exchangeBoundary(w.index(w.width-1,y),dt,out);}
  }
  exchangeBoundary(i,dt,out){
    const w=this.world;if(w.registry.fromIndex(w.material[i]).id!=='air')return;
    const T=w.temperatureAtIndex(i),q=C.passiveOutdoorLeakWPerK*(T-out)*dt;w.energy[i]-=q;w.environment.energyReceived+=q;this.metrics.externalEnergy+=q;
  }
}
