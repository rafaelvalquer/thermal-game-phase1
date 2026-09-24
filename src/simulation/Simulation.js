import { ThermalSystem } from './ThermalSystem.js';
import { AirflowSystem } from './AirflowSystem.js';
import { FluidSystem } from './FluidSystem.js';
import { EnergySystem } from './EnergySystem.js';
import { MissionRuntime } from '../campaign/MissionRuntime.js';
import { CoolingSystem } from './cooling/CoolingSystem.js';

export class Simulation {
  constructor(world,level){
    this.world=world;this.level=level;this.elapsed=0;this.paused=false;this.speed=1;
    this.datacenter=world.datacenter||null;
    this.metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0,maxTemp:25,maxAirTemp:25,maxMachineTemp:25,avgTemp:25};
    this.metrics.maxTempEver=25;this.metrics.maxPowerEver=0;
    this.thermal=new ThermalSystem(world,this.metrics);
    this.airflow=new AirflowSystem(world,this.metrics);
    const systems=level.thermalSystems;
    this.simpleCooling=systems?.simpleCooling===true;
    this.waterCooling=systems?.waterCooling??!this.simpleCooling;
    this.fluid=this.waterCooling?new FluidSystem(world,this.metrics):null;
    this.cooling=this.simpleCooling?new CoolingSystem(world,this.airflow,this.metrics):null;
    this.energySystem=new EnergySystem(world,this.metrics);
    this.mission=new MissionRuntime(world,level,this.metrics);
    this.history=[];this.historyTimer=0;
  }

  initialize(){this.energySystem.initialize();}
  setSpeed(v){this.speed=v;}
  togglePause(){this.paused=!this.paused;}

  update(dt){
    if(this.paused||this.mission.state!=='running')return;
    dt*=this.speed;
    const calendarDt=this.datacenter?dt*360:dt;
    this.elapsed+=calendarDt;this.mission.preUpdate(this.elapsed);
    const externalBefore=this.metrics.externalEnergy,generatedBefore=this.metrics.generatedHeat;

    this.world.datacenter?.update(calendarDt);
    this.cooling?.update(dt);
    this.airflow.updateVelocity(dt);
    this.thermal.update(dt,this.elapsed);
    this.cooling?.exchangeRooms(dt);
    this.fluid?.update(dt);
    this.airflow.advectHeat(dt);
    this.airflow.applyExhaust(dt);
    this.energySystem.update(dt,{billingDt:calendarDt});
    this.metrics.externalRejectedPower=(this.metrics.externalEnergy-externalBefore)/dt;
    this.metrics.generatedHeatPower=(this.metrics.generatedHeat-generatedBefore)/dt;
    this.metrics.machineCoolingPower=this.world.entities.filter(e=>e.isHeatMachine).reduce((sum,e)=>sum+e.coolingPower,0);
    for(const e of this.world.entities.filter(e=>e.isHeatMachine))e.thermalBalance=e.coolingPower-e.heatGenerationPower;

    this.sampleSensors();this.updateMetrics();this.world.datacenter?.afterThermalStep(calendarDt);this.mission.update(dt,this.elapsed);this.captureHistory(dt);
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
    this.metrics.maxMachineTemp=machineTemps.length?Math.max(...machineTemps):0;
    this.metrics.maxTemp=Math.max(this.metrics.maxAirTemp,this.metrics.maxMachineTemp);
    this.metrics.avgTemp=count?sum/count:0;
    this.metrics.maxTempEver=Math.max(this.metrics.maxTempEver,this.metrics.maxTemp);
    this.metrics.maxPowerEver=Math.max(this.metrics.maxPowerEver,this.metrics.powerDraw);
  }

  captureHistory(dt){
    this.historyTimer+=dt;if(this.historyTimer<1)return;this.historyTimer=0;
    this.history.push({t:this.elapsed,max:this.metrics.maxTemp,avg:this.metrics.avgTemp,power:this.metrics.powerDraw});
    if(this.history.length>360)this.history.shift();
  }

  totalInternalEnergy(){return this.energySystem.totalInternalEnergy();}
  registerConstruction(before){const after=this.totalInternalEnergy();this.energySystem.registerConstructionDelta(after-before);}
}
