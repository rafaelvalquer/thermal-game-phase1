import { clamp } from '../../utils/MathUtils.js';
import { AirGrid } from './AirGrid.js';
import { AirBoundarySystem } from './AirBoundarySystem.js';
import { AirVelocitySolver } from './AirVelocitySolver.js';
import { AirPressureSolver } from './AirPressureSolver.js';
import { AirDragSystem } from './AirDragSystem.js';
import { AirThermalAdvection } from './AirThermalAdvection.js';
import { FanModel } from './FanModel.js';
import { AirDiagnostics } from './AirDiagnostics.js';
import { ExhaustCaptureSystem } from './ExhaustCaptureSystem.js';
import { AIR } from './AirConstants.js';

export class AirflowSystem {
  constructor(world,metrics){
    this.world=world;this.metrics=metrics;
    this.grid=new AirGrid(world);
    this.boundaries=new AirBoundarySystem(this.grid);
    this.velocity=new AirVelocitySolver(this.grid);
    this.pressure=new AirPressureSolver(this.grid);
    this.drag=new AirDragSystem(this.grid);
    this.thermal=new AirThermalAdvection(this.grid,metrics);
    this.fans=new FanModel(this.grid);
    this.capture=new ExhaustCaptureSystem(this.grid);
    this.diagnostics=new AirDiagnostics(this.grid);
    this.grid.syncTopology(true);
  }

  update(dt){
    this.updateVelocity(dt);
    this.advectHeat(dt);
    this.applyExhaust(dt);
  }

  buildVelocityField(dt=.05){this.updateVelocity(dt);}

  updateVelocity(dt){
    const g=this.grid;
    g.syncTopology();
    this.velocity.advect(dt);
    this.applyRadiatorNaturalConvection(dt);
    this.fans.applyAll(dt);
    this.applyCoolingUnitExhausts(dt);
    this.capture.apply(dt);
    this.drag.apply(dt);
    this.boundaries.enforce();

    this.pressure.computeDivergence();
    this.pressure.solve(dt);
    this.pressure.project(dt);
    this.boundaries.enforce();

    this.pressure.computeDivergence();
    this.fans.updateAllDiagnostics();
    g.syncWorldVelocity();
    this.diagnostics.update();
  }

  applyRadiatorNaturalConvection(dt){
    const g=this.grid,w=this.world;
    for(const radiator of w.entitiesByType('radiator')){
      if(!radiator.enabled)continue;
      const localAir=w.inBounds(radiator.x,radiator.y)?w.temperatureAt(radiator.x,radiator.y):radiator.waterTemperature;
      const delta=radiator.waterTemperature-localAir;
      if(delta<=.5)continue;
      const force=(radiator.naturalAirflow||.28)*clamp(delta/20,0,1)*(1-Math.exp(-6*dt));

      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=radiator.x+dx,y=radiator.y+dy;
        if(!g.isAir(x,y))continue;
        if(dx>0)g.u[g.uIndex(radiator.x+1,radiator.y)]+=force;
        if(dx<0)g.u[g.uIndex(radiator.x,radiator.y)]-=force;
        if(dy>0)g.v[g.vIndex(radiator.x,radiator.y+1)]+=force;
        if(dy<0)g.v[g.vIndex(radiator.x,radiator.y)]-=force;
      }
    }
  }

  advectHeat(dt){this.thermal.advect(dt);}

  applyExhaust(dt){
    if(dt<=0)return;
    const w=this.world,out=w.environment.temperature;
    this.metrics.exhaustRejectedPower=0;
    for(const e of w.entitiesByType('exhaust')){
      e.heatRejectedPower=0;
      const connected=this.isExhaustConnectedToOutside(e);
      const d=e.direction,blocked=this.grid.inCell(e.x+d.x,e.y+d.y)&&this.grid.isSolid(e.x+d.x,e.y+d.y);
      e.status=blocked?'BLOCKED':!connected?'NO OUTLET':e.flowEfficiency<.2?'BLOCKED':e.flowEfficiency<.6?'HIGH RESISTANCE':'READY';
      if(!e.enabled)continue;
      if(!connected||blocked)continue;
      const volumeFlow=Math.max(0,e.currentFlow||0);
      if(volumeFlow<=1e-5)continue;
      const massFlow=AIR.density*volumeFlow;
      const cells=this.capture.cells(e),weightSum=cells.reduce((sum,c)=>sum+c.weight,0);
      for(const c of cells){
        const i=w.index(c.x,c.y),T=w.temperatureAtIndex(i),cap=w.capacityAtIndex(i);
        const localMassFlow=massFlow*(c.weight/weightSum);
        const localMass=w.massAt(c.x,c.y);
        const fraction=clamp((localMassFlow*dt)/Math.max(localMass,1e-6),0,.45);
        const q=(T-out)*cap*fraction;
        w.energy[i]-=q;w.environment.energyReceived+=q;this.metrics.externalEnergy+=q;
        e.heatRejectedPower+=q/dt;
      }
      this.metrics.exhaustRejectedPower+=e.heatRejectedPower;
    }
  }

  applyCoolingUnitExhausts(dt){
    const g=this.grid,w=this.world;
    for(const unit of w.entitiesByType('coolingUnit')){
      if(!unit.enabled||!unit.indoor||(unit.heatRejected||0)<=0)continue;
      const d=unit.direction||{x:1,y:0},nextX=unit.x+d.x,nextY=unit.y+d.y;
      const outletBlocked=d.x?g.blockedU(d.x>0?unit.x+1:unit.x,unit.y):g.blockedV(unit.x,d.y>0?unit.y+1:unit.y);
      if(!g.isAir(nextX,nextY)||outletBlocked)continue;
      const magnitude=Math.min(1.2,Math.sqrt(unit.heatRejected/50000)*.35),faceX=d.x>0?unit.x+1:unit.x,faceY=d.y>0?unit.y+1:unit.y;
      // A short, balanced fan loop creates a continuous outlet jet without a pressure source.
      const outletX=unit.x+d.x*.5,outletY=unit.y+d.y*.5;
      const lateralX=-d.y,lateralY=d.x;
      for(const offset of [-.5,.5]){
        const lx=outletX+lateralX*offset,ly=outletY+lateralY*offset,cx=Math.floor(lx),cy=Math.floor(ly);
        if(!g.isAir(cx,cy))continue;
        const backX=cx-d.x,backY=cy-d.y;
        if(g.isAir(backX,backY)){
          if(d.x)g.u[g.uIndex(d.x>0?cx:cx+1,cy)]+=magnitude*d.x;
          else g.v[g.vIndex(cx,d.y>0?cy:cy+1)]+=magnitude*d.y;
        }
        if(lateralX){const sideX=cx+lateralX;if(g.isAir(sideX,cy))g.u[g.uIndex(lateralX>0?cx+1:cx,cy)]+=magnitude*lateralX*.5;}
        else{const sideY=cy+lateralY;if(g.isAir(cx,sideY))g.v[g.vIndex(cx,lateralY>0?cy+1:cy)]+=magnitude*lateralY*.5;}
      }
      if(d.x)g.u[g.uIndex(faceX,unit.y)]+=magnitude*d.x;
      else g.v[g.vIndex(unit.x,faceY)]+=magnitude*d.y;
    }
  }

  isExhaustConnectedToOutside(exhaust){return this.capture.isExhaustConnectedToOutside(exhaust);}
}
