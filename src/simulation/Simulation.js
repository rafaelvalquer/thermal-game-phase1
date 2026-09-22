import { ThermalSystem } from './ThermalSystem.js';
import { AirflowSystem } from './AirflowSystem.js';
import { FluidSystem } from './FluidSystem.js';
import { EnergySystem } from './EnergySystem.js';
import { MissionRuntime } from '../campaign/MissionRuntime.js';

export class Simulation {
  constructor(world,level){
    this.world=world;this.level=level;this.elapsed=0;this.paused=false;this.speed=1;
    this.metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0,maxTemp:25,maxAirTemp:25,avgTemp:25};
    this.thermal=new ThermalSystem(world,this.metrics);this.airflow=new AirflowSystem(world,this.metrics);this.fluid=new FluidSystem(world,this.metrics);this.energySystem=new EnergySystem(world,this.metrics);
    this.mission=new MissionRuntime(world,level,this.metrics);this.history=[];this.historyTimer=0;
  }
  initialize(){this.energySystem.initialize();}
  setSpeed(v){this.speed=v;}
  togglePause(){this.paused=!this.paused;}
  update(dt){
    if(this.paused||this.mission.state!=='running')return;
    dt*=this.speed;this.elapsed+=dt;this.mission.preUpdate(this.elapsed);
    this.thermal.update(dt,this.elapsed);this.airflow.update(dt);this.fluid.update(dt);this.energySystem.update(dt);
    this.sampleSensors();this.updateMetrics();this.mission.update(dt,this.elapsed);this.captureHistory(dt);
  }
  sampleSensors(){for(const s of this.world.entitiesByType('sensor'))if(this.world.inBounds(s.x,s.y))s.sample(this.world.temperatureAt(s.x,s.y));}
  updateMetrics(){
    let sum=0,maxAir=-Infinity,count=0;
    for(let i=0;i<this.world.size;i++){
      if(this.world.registry.fromIndex(this.world.material[i]).id!=='air')continue;
      const t=this.world.temperatureAtIndex(i);sum+=t;maxAir=Math.max(maxAir,t);count++;
    }
    const machineTemps=this.world.entities.filter(e=>e.isHeatMachine&&e.type!=='furnace').map(m=>m.temperature);
    this.metrics.maxAirTemp=count?maxAir:0;
    this.metrics.maxTemp=Math.max(count?maxAir:-Infinity,...machineTemps);
    this.metrics.avgTemp=count?sum/count:0;
  }
  captureHistory(dt){
    this.historyTimer+=dt;if(this.historyTimer<1)return;this.historyTimer=0;
    this.history.push({t:this.elapsed,max:this.metrics.maxTemp,avg:this.metrics.avgTemp,power:this.metrics.powerDraw});
    if(this.history.length>360)this.history.shift();
  }
  totalInternalEnergy(){return this.energySystem.totalInternalEnergy();}
  registerConstruction(before){const after=this.totalInternalEnergy();this.energySystem.registerConstructionDelta(after-before);}
}
