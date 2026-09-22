import { clamp } from '../utils/MathUtils.js';
import { TILE_SIZE_METERS } from '../utils/Constants.js';
import { SimulationConfig as C } from './SimulationConfig.js';

export class AirflowSystem {
  constructor(world, metrics){ this.world=world; this.metrics=metrics; }
  update(dt){ this.buildVelocityField(); this.advectHeat(dt); this.applyExhaust(dt); }
  buildVelocityField(){
    const w=this.world; w.airX.fill(0); w.airY.fill(0);
    for(const e of w.entities){
      if(!e.enabled || !['fan','exhaust'].includes(e.type)) continue;
      const dir=e.direction;
      for(let step=0;step<=e.range;step++){
        const cx=e.x+dir.x*step, cy=e.y+dir.y*step; if(!w.inBounds(cx,cy)) break;
        if(step>0 && !w.isAir(cx,cy)) break;
        const strength=e.airflow*(1-step/(e.range+2));
        for(let side=-2;side<=2;side++){
          const sx=cx + (dir.y!==0 ? side : 0); const sy=cy + (dir.x!==0 ? side : 0);
          if(!w.inBounds(sx,sy)||!w.isAir(sx,sy)) continue;
          const i=w.index(sx,sy), fall=1/(1+Math.abs(side)*.7);
          w.airX[i]+=dir.x*strength*fall; w.airY[i]+=dir.y*strength*fall;
        }
      }
      if(e.type==='exhaust'){
        for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++){
          const x=e.x+dx,y=e.y+dy; if(!w.inBounds(x,y)||!w.isAir(x,y)) continue;
          const d=Math.hypot(dx,dy); if(d<.1||d>3.5) continue;
          const i=w.index(x,y), pull=e.airflow*.7/(1+d);
          w.airX[i]+=-dx/d*pull; w.airY[i]+=-dy/d*pull;
        }
      }
    }
  }
  advectHeat(dt){
    const w=this.world; w.nextEnergy.set(w.energy);
    for(let y=1;y<w.height-1;y++) for(let x=1;x<w.width-1;x++){
      if(!w.isAir(x,y)) continue;
      const i=w.index(x,y), vx=w.airX[i], vy=w.airY[i], speed=Math.hypot(vx,vy); if(speed<.05) continue;
      const ax=Math.abs(vx), ay=Math.abs(vy); let nx=x,ny=y;
      if(ax>=ay) nx+=Math.sign(vx); else ny+=Math.sign(vy);
      if(!w.inBounds(nx,ny)||!w.isAir(nx,ny)) continue;
      const j=w.index(nx,ny), Ts=w.temperatureAtIndex(i), Td=w.temperatureAtIndex(j), dT=Ts-Td;
      if(Math.abs(dT)<1e-5) continue;
      const Ci=w.capacityAtIndex(i), Cj=w.capacityAtIndex(j);
      let q=speed*C.airflowMixingFactor*Math.min(Ci,Cj)*dT*dt;
      const qEq=Math.abs(dT)/(1/Ci+1/Cj);
      q=clamp(q,-qEq*.42,qEq*.42);
      w.nextEnergy[i]-=q; w.nextEnergy[j]+=q;
    }
    w.energy.set(w.nextEnergy);
  }
  applyExhaust(dt){
    const w=this.world, out=w.environment.temperature;
    for(const e of w.entitiesByType('exhaust')){
      if(!e.enabled) continue;
      const airDensity=1.225, faceArea=TILE_SIZE_METERS*2.5, efficiency=.45;
      const massFlow=airDensity*faceArea*e.airflow*efficiency; // kg/s total intake
      const cellMass=airDensity*TILE_SIZE_METERS*TILE_SIZE_METERS*2.5;
      const cells=[]; let weightSum=0;
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
        const x=e.x+dx,y=e.y+dy,d=Math.hypot(dx,dy);if(d>2.4||!w.inBounds(x,y)||!w.isAir(x,y))continue;
        const weight=1/(1+d*1.25);cells.push({x,y,weight});weightSum+=weight;
      }
      for(const c of cells){
        const i=w.index(c.x,c.y),T=w.temperatureAtIndex(i),cap=w.capacityAtIndex(i);
        const localMassFlow=massFlow*(c.weight/weightSum);
        const fraction=clamp((localMassFlow*dt)/cellMass,0,.65);
        const q=(T-out)*cap*fraction;
        w.energy[i]-=q;w.environment.energyReceived+=q;this.metrics.externalEnergy+=q;
      }
    }
  }
}
