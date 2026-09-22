import { CARDINALS, keyOf, manhattan } from '../utils/GridUtils.js';
import { clamp } from '../utils/MathUtils.js';
import { WATER_CP } from '../utils/Constants.js';

const FLUID_TYPES=new Set(['pipe','pump','tank','radiator','exchanger']);
export class FluidSystem {
  constructor(world,metrics){ this.world=world; this.metrics=metrics; this.networks=[]; }
  update(dt){ this.networks=this.buildNetworks(); for(const n of this.networks){ this.assignFlow(n); this.transport(n,dt); this.circulate(n,dt); } this.exchangeMachines(dt); this.radiate(dt); }
  fluidEntities(){ return this.world.entities.filter(e=>FLUID_TYPES.has(e.type)); }
  buildNetworks(){
    const ents=this.fluidEntities(), byPos=new Map(ents.map(e=>[keyOf(e.x,e.y),e])), seen=new Set(), nets=[];
    for(const start of ents){ if(seen.has(start.id)) continue; const stack=[start], arr=[]; seen.add(start.id);
      while(stack.length){ const e=stack.pop(); arr.push(e); for(const [dx,dy] of CARDINALS){ const n=byPos.get(keyOf(e.x+dx,e.y+dy)); if(n&&!seen.has(n.id)){ seen.add(n.id); stack.push(n); } } }
      nets.push(arr);
    }
    return nets;
  }
  assignFlow(net){
    const pumps=net.filter(e=>e.type==='pump'&&e.enabled); const resistance=net.reduce((s,e)=>s+(e.resistance||1),0) || 1;
    const drive=pumps.reduce((s,p)=>s+p.hydraulicPower,0); const flow=clamp(drive/resistance,0,5);
    net.forEach(e=>e.flowRate=flow);
  }
  transport(net,dt){
    if(net.length<2) return; const byPos=new Map(net.map(e=>[keyOf(e.x,e.y),e])); const done=new Set();
    for(const a of net){ for(const [dx,dy] of [[1,0],[0,1]]){ const b=byPos.get(keyOf(a.x+dx,a.y+dy)); if(!b) continue;
      const pair=`${a.id}:${b.id}`; if(done.has(pair)) continue; done.add(pair);
      const flow=Math.min(a.flowRate||0,b.flowRate||0); if(flow<=0) continue;
      const Ta=a.waterTemperature,Tb=b.waterTemperature,dT=Ta-Tb;if(Math.abs(dT)<1e-5)continue;
      const Ca=a.waterMass*WATER_CP,Cb=b.waterMass*WATER_CP; let q=flow*WATER_CP*dT*dt*.08;
      const qEq=Math.abs(dT)/(1/Ca+1/Cb); q=clamp(q,-qEq*.45,qEq*.45); a.energy-=q;b.energy+=q;
    } }
  }

  circulate(net,dt){
    const flow=net[0]?.flowRate||0;if(flow<=0||net.length<2)return;
    let energy=0,capacity=0;for(const e of net){energy+=e.energy;capacity+=e.waterMass*WATER_CP;}
    if(capacity<=0)return;const target=energy/capacity;
    // Represents bulk circulation through the connected loop. Resistance still
    // controls flow, while every transfer is balanced around the same target.
    const fraction=clamp(flow*dt*1.5,0,.22);
    for(const e of net){const cap=e.waterMass*WATER_CP;e.energy+=cap*(target-e.waterTemperature)*fraction;}
  }
  exchangeMachines(dt){
    const machines=this.world.entitiesByType('machine');
    for(const ex of this.world.entitiesByType('exchanger')){
      if(!ex.enabled) continue; const m=machines.filter(m=>manhattan(m,ex)<=1).sort((a,b)=>b.temperature-a.temperature)[0]; if(!m) continue;
      const dT=m.temperature-ex.waterTemperature;if(Math.abs(dT)<1e-5)continue;
      const Cm=m.mass*m.heatCapacity,Cw=ex.waterMass*WATER_CP; let q=ex.ua*dT*dt*(.4+Math.min(1.5,ex.flowRate*.4));
      const qEq=Math.abs(dT)/(1/Cm+1/Cw);q=clamp(q,-qEq*.4,qEq*.4);m.energy-=q;ex.energy+=q;if(q>0)m.coolingPower+=q/dt;
    }
  }
  radiate(dt){
    const w=this.world;
    for(const r of w.entitiesByType('radiator')){
      if(!r.enabled) continue; const i=w.index(r.x,r.y); if(!w.isAir(r.x,r.y)) continue;
      const Ta=w.temperatureAtIndex(i), Tw=r.waterTemperature,dT=Tw-Ta;if(Math.abs(dT)<1e-5)continue;
      const speed=Math.hypot(w.airX[i],w.airY[i]), fanBoost=1+Math.min(2,speed*.4), Cw=r.waterMass*WATER_CP,Ca=w.capacityAtIndex(i);
      let q=r.ua*fanBoost*dT*dt*(.45+Math.min(1.5,r.flowRate*.35)); const qEq=Math.abs(dT)/(1/Cw+1/Ca);q=clamp(q,-qEq*.4,qEq*.4);r.energy-=q;w.energy[i]+=q;
    }
  }
}
