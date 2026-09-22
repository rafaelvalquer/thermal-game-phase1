import { clamp } from '../../utils/MathUtils.js';
import { TILE_SIZE_METERS } from '../../utils/Constants.js';
import { AirGrid } from './AirGrid.js';
import { AirBoundarySystem } from './AirBoundarySystem.js';
import { AirVelocitySolver } from './AirVelocitySolver.js';
import { AirPressureSolver } from './AirPressureSolver.js';
import { AirDragSystem } from './AirDragSystem.js';
import { AirThermalAdvection } from './AirThermalAdvection.js';
import { FanModel } from './FanModel.js';
import { AirDiagnostics } from './AirDiagnostics.js';

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
    const w=this.world,out=w.environment.temperature;
    for(const e of w.entitiesByType('exhaust')){
      if(!e.enabled)continue;
      const volumeFlow=Math.max(0,e.currentFlow||0);
      if(volumeFlow<=1e-5)continue;
      const massFlow=1.225*volumeFlow;
      const cells=[];let weightSum=0;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        const x=e.x+dx,y=e.y+dy,d=Math.hypot(dx,dy);
        if(d>2.4||!w.inBounds(x,y)||!w.isAir(x,y))continue;
        const weight=1/(1+d*1.25);cells.push({x,y,weight});weightSum+=weight;
      }
      for(const c of cells){
        const i=w.index(c.x,c.y),T=w.temperatureAtIndex(i),cap=w.capacityAtIndex(i);
        const localMassFlow=massFlow*(c.weight/weightSum);
        const localMass=w.massAt(c.x,c.y);
        const fraction=clamp((localMassFlow*dt)/Math.max(localMass,1e-6),0,.45);
        const q=(T-out)*cap*fraction;
        w.energy[i]-=q;w.environment.energyReceived+=q;this.metrics.externalEnergy+=q;
      }
    }
  }
}
