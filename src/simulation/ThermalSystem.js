import { TILE_AREA, TILE_SIZE_METERS } from '../utils/Constants.js';
import { harmonicMean, clamp } from '../utils/MathUtils.js';
import { SimulationConfig as C } from './SimulationConfig.js';

export class ThermalSystem {
  constructor(world, metrics) { this.world=world; this.metrics=metrics; }
  update(dt, elapsed) {
    this.applyMachineHeat(dt, elapsed);
    this.conduct(dt);
    this.exchangeMachines(dt);
    this.passiveOutdoorExchange(dt);
  }
  applyMachineHeat(dt, elapsed) {
    for (const m of this.world.entitiesByType('machine')) {
      m.started = elapsed >= 10;
      m.coolingPower = 0;
      if (!m.started || !m.enabled) continue;
      const q=m.heatOutput*dt; m.energy += q; this.metrics.generatedHeat += q;
    }
  }
  conduct(dt) {
    const w=this.world; w.nextEnergy.set(w.energy); w.heatFlux.fill(0);
    const dirs=[[1,0],[0,1]];
    for(let y=0;y<w.height;y++) for(let x=0;x<w.width;x++) {
      const i=w.index(x,y); const Ti=w.temperatureAtIndex(i); const mi=w.registry.fromIndex(w.material[i]);
      for(const [dx,dy] of dirs){
        const nx=x+dx, ny=y+dy; if(!w.inBounds(nx,ny)) continue;
        const j=w.index(nx,ny); const Tj=w.temperatureAtIndex(j); const mj=w.registry.fromIndex(w.material[j]);
        const dT=Ti-Tj; if(Math.abs(dT)<1e-7) continue;
        const k=harmonicMean(mi.conductivity,mj.conductivity); if(k<=0) continue;
        let q=k*TILE_AREA*dT/TILE_SIZE_METERS*dt*C.conductionScale;
        const ci=w.capacityAtIndex(i), cj=w.capacityAtIndex(j);
        const qEq=Math.abs(dT)/(1/ci+1/cj);
        q=clamp(q,-qEq*C.maxConductionEqualizationFraction,qEq*C.maxConductionEqualizationFraction);
        w.nextEnergy[i]-=q; w.nextEnergy[j]+=q;
        w.heatFlux[i]+=Math.abs(q/dt); w.heatFlux[j]+=Math.abs(q/dt);
      }
    }
    w.energy.set(w.nextEnergy);
  }
  exchangeMachines(dt) {
    const w=this.world;
    for(const m of w.entitiesByType('machine')) {
      const cells=[];
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        if(Math.abs(dx)+Math.abs(dy)===0) continue;
        const x=m.x+dx,y=m.y+dy; if(w.inBounds(x,y) && w.isAir(x,y)) cells.push(w.index(x,y));
      }
      if(!cells.length) continue;
      const Cm=m.mass*m.heatCapacity;
      const avgSpeed=cells.reduce((sum,i)=>sum+Math.hypot(w.airX[i],w.airY[i]),0)/cells.length;
      const totalUA=C.machinePassiveUA + C.machineForcedUAperMS*avgSpeed;
      for(const i of cells){
        const Ta=w.temperatureAtIndex(i), Tm=m.temperature, Ca=w.capacityAtIndex(i), dT=Tm-Ta;
        if(Math.abs(dT)<1e-5) continue;
        let q=totalUA*dT*dt/cells.length;
        const qEq=Math.abs(dT)/(1/Cm+1/Ca);
        q=clamp(q,-qEq*.35,qEq*.35);
        m.energy-=q; w.energy[i]+=q;
      }
    }
  }
  passiveOutdoorExchange(dt){
    const w=this.world, out=w.environment.temperature;
    // Only air adjacent to map border exchanges weakly with outside.
    for(let x=0;x<w.width;x++) { this.exchangeBoundary(w.index(x,0),dt,out); this.exchangeBoundary(w.index(x,w.height-1),dt,out); }
    for(let y=1;y<w.height-1;y++) { this.exchangeBoundary(w.index(0,y),dt,out); this.exchangeBoundary(w.index(w.width-1,y),dt,out); }
  }
  exchangeBoundary(i,dt,out){
    const w=this.world; if(w.registry.fromIndex(w.material[i]).id!=='air') return;
    const T=w.temperatureAtIndex(i); const q=C.passiveOutdoorLeakWPerK*(T-out)*dt;
    w.energy[i]-=q; w.environment.energyReceived+=q; this.metrics.externalEnergy+=q;
  }
}
