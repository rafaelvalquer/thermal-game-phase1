import { isPowered } from '../PowerState.js';
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
import { AirFaceTopologyCache } from './AirFaceTopologyCache.js';

export class AirflowSystem {
  constructor(world,metrics){
    this.world=world;this.metrics=metrics;
    world.airflowSystem=this;
    this.grid=new AirGrid(world);
    this.faceTopology=new AirFaceTopologyCache(this.grid);
    this.boundaries=new AirBoundarySystem(this.grid);
    this.velocity=new AirVelocitySolver(this.grid,this.faceTopology);
    this.pressure=new AirPressureSolver(this.grid,{topology:this.faceTopology});
    this.drag=new AirDragSystem(this.grid,this.faceTopology);
    this.thermal=new AirThermalAdvection(this.grid,metrics,this.faceTopology);
    this.fans=new FanModel(this.grid);
    this.capture=new ExhaustCaptureSystem(this.grid);
    this.diagnostics=new AirDiagnostics(this.grid);
    this.pendingCoolingMomentum=null;this.monitor=null;
    this.grid.syncTopology(true);
  }

  queueCoolingMomentum(sources,dt){this.pendingCoolingMomentum=sources?.length?{sources,dt}:null;}

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
    if(this.pendingCoolingMomentum)this.applyCoolingMomentum(this.pendingCoolingMomentum.sources,this.pendingCoolingMomentum.dt);
    this.pendingCoolingMomentum=null;
    this.applyCoolingUnitExhausts(dt);
    this.capture.apply(dt);
    this.drag.apply(dt);
    this.boundaries.enforce();

    this.pressure.computeDivergence();
    this.monitor?.count('pressureSolveCount');this.monitor?.begin('pressureMs');this.pressure.solve(dt);this.monitor?.end('pressureMs');
    this.monitor?.count('pressureIterationsUsed',this.pressure.iterationsUsed);
    this.monitor?.set('pressureIterationsMax',this.pressure.iterationsUsed);
    if(this.pressure.earlyExit)this.monitor?.count('pressureEarlyExitCount');
    this.pressure.project(dt);
    this.boundaries.enforce();

    this.pressure.computeDivergence();
    this.fans.updateAllDiagnostics();
    const diagnostics=g.syncWorldVelocity({});
    this.diagnostics.update(diagnostics);
  }

  applyCoolingMomentum(sources,dt){
    const grid=this.grid;
    for(const {vent} of sources){if(vent.flowRate<=0||!grid.inCell(vent.x,vent.y)||grid.isSolid(vent.x,vent.y))continue;const d=vent.direction||{x:0,y:1},area=vent.area??.5*2.5,velocity=vent.flowRate/Math.max(area,1e-6)*(vent.throwCoefficient??1);
      if(d.x>0&&vent.x+1<grid.width)grid.u[grid.uIndex(vent.x+1,vent.y)]+=velocity;else if(d.x<0&&vent.x>0)grid.u[grid.uIndex(vent.x,vent.y)]-=velocity;else if(d.y>0&&vent.y+1<grid.height)grid.v[grid.vIndex(vent.x,vent.y+1)]+=velocity;else if(d.y<0&&vent.y>0)grid.v[grid.vIndex(vent.x,vent.y)]-=velocity;}
  }

  applyRadiatorNaturalConvection(dt){
    const g=this.grid,w=this.world;
    for(const radiator of w.entitySetByType('radiator')){
      if(!isPowered(radiator))continue;
      const localAir=w.inBounds(radiator.x,radiator.y)?w.temperatureAt(radiator.x,radiator.y):radiator.waterTemperature;
      const delta=radiator.waterTemperature-localAir;
      // The radiator's integrated fan draws through the coil and pushes the warm plume
      // toward its oriented discharge. Natural convection remains active around it.
      const direction=radiator.direction||{x:1,y:0},fanForce=Math.min(1.25,(radiator.fanAirflow||2.5)*.14)*(1-Math.exp(-8*dt));
      const backX=radiator.x-direction.x,backY=radiator.y-direction.y,frontX=radiator.x+direction.x,frontY=radiator.y+direction.y;
      if(g.isAir(backX,backY)&&(g.isAir(frontX,frontY)||radiator.outdoor&&!w.inBounds(frontX,frontY))){
        if(direction.x>0)g.u[g.uIndex(radiator.x+(w.inBounds(frontX,frontY)?1:0),radiator.y)]+=fanForce;
        else if(direction.x<0)g.u[g.uIndex(radiator.x+(w.inBounds(frontX,frontY)?0:1),radiator.y)]-=fanForce;
        else if(direction.y>0)g.v[g.vIndex(radiator.x,radiator.y+(w.inBounds(frontX,frontY)?1:0))]+=fanForce;
        else if(direction.y<0)g.v[g.vIndex(radiator.x,radiator.y+(w.inBounds(frontX,frontY)?0:1))]-=fanForce;
      }
      if(delta<=.5)continue;
      const force=(radiator.naturalAirflow||.28)*clamp(delta/20,0,1)*(1-Math.exp(-6*dt));
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=radiator.x+dx,y=radiator.y+dy;if(!g.isAir(x,y))continue;
        if(dx>0)g.u[g.uIndex(radiator.x+1,radiator.y)]+=force;
        if(dx<0)g.u[g.uIndex(radiator.x,radiator.y)]-=force;
        if(dy>0)g.v[g.vIndex(radiator.x,radiator.y+1)]+=force;
        if(dy<0)g.v[g.vIndex(radiator.x,radiator.y)]-=force;
      }
    }
  }

  advectHeat(dt){this.thermal.advect(dt);this.monitor?.count('advectionSubstepsUsed',this.thermal.substepsUsed||0);this.monitor?.set('advectionSubstepsMax',this.thermal.substepsUsed||0);}

  applyExhaust(dt){
    if(dt<=0)return;
    const w=this.world,out=w.environment.temperature;
    this.metrics.exhaustRejectedPower=0;
    for(const e of w.entitySetByType('exhaust')){
      e.heatRejectedPower=0;
      const connected=this.isExhaustConnectedToOutside(e);
      e.status=!connected?'BLOCKED':e.flowEfficiency<.2?'BLOCKED':e.flowEfficiency<.6?'HIGH RESISTANCE':'READY';
      if(!isPowered(e))continue;
      if(!connected)continue;
      const volumeFlow=Math.max(0,e.currentFlow||0);
      if(volumeFlow<=1e-5)continue;
      const massFlow=AIR.density*volumeFlow;
      const cells=this.capture.cells(e).map(c=>{
        const temperature=w.temperatureAt(c.x,c.y),hotness=Math.max(0,temperature-out);
        return {...c,temperature,thermalWeight:c.weight*(1+Math.min(40,hotness)/20)};
      }),weightSum=cells.reduce((sum,c)=>sum+c.thermalWeight,0);
      for(const c of cells){
        const i=w.index(c.x,c.y),T=w.temperatureAtIndex(i),cap=w.capacityAtIndex(i);
        const localMassFlow=massFlow*(c.thermalWeight/weightSum);
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
    for(const unit of w.entitySetByType('coolingUnit')){
      if(!isPowered(unit)||!unit.indoor||(unit.heatRejected||0)<=0)continue;
      const d=unit.direction||{x:1,y:0},length=Math.max(1,unit.footprintLength||1),nextX=unit.x+d.x*length,nextY=unit.y+d.y*length;
      const outletBlocked=d.x?g.blockedU(d.x>0?unit.x+length:unit.x-length+1,unit.y):g.blockedV(unit.x,d.y>0?unit.y+length:unit.y-length+1);
      if(!g.isAir(nextX,nextY)||outletBlocked)continue;
      const magnitude=Math.min(1.2,Math.sqrt(unit.heatRejected/50000)*.35);
      // A short, balanced fan loop creates a continuous outlet jet without a pressure source.
      const outletX=unit.x+d.x*(length-.5),outletY=unit.y+d.y*(length-.5);
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
      if(d.x)g.u[g.uIndex(d.x>0?unit.x+length:unit.x-length+1,unit.y)]+=magnitude*d.x;
      else g.v[g.vIndex(unit.x,d.y>0?unit.y+length:unit.y-length+1)]+=magnitude*d.y;
    }
  }

  isExhaustConnectedToOutside(exhaust){return this.capture.isExhaustConnectedToOutside(exhaust);}
}
