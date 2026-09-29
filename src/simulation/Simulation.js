import { ThermalSystem } from './ThermalSystem.js';
import { AirflowSystem } from './AirflowSystem.js';
import { FluidSystem } from './FluidSystem.js';
import { EnergySystem } from './EnergySystem.js';
import { MissionRuntime } from '../campaign/MissionRuntime.js';
import { CoolingSystem } from './cooling/CoolingSystem.js';
import { BatteryDispatchSystem } from './BatteryDispatchSystem.js';

export class Simulation {
  constructor(world,level,{monitor=null}={}){
    this.monitor=monitor;
    this.world=world;this.level=level;this.elapsed=0;this.paused=false;this.speed=1;
    this.datacenter=world.datacenter||null;
    this.metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,solarGenerationW:0,energyBalance:0,maxTemp:25,maxAirTemp:25,maxMachineTemp:25,avgTemp:25,airTemperatureSum:0,airCellCount:0};
    this.metrics.maxTempEver=25;this.metrics.maxPowerEver=0;
    this.thermal=new ThermalSystem(world,this.metrics);
    this.thermal.monitor=monitor;
    this.airflow=new AirflowSystem(world,this.metrics);
    this.airflow.monitor=monitor;
    const systems=level.thermalSystems;
    this.simpleCooling=systems?.simpleCooling===true;
    this.waterCooling=systems?.waterCooling??!this.simpleCooling;
    this.fluid=this.waterCooling?new FluidSystem(world,this.metrics):null;
    this.cooling=this.simpleCooling?new CoolingSystem(world,this.airflow,this.metrics):null;
    if(this.cooling)this.cooling.monitor=monitor;if(this.fluid)this.fluid.monitor=monitor;
    this.energySystem=new EnergySystem(world,this.metrics);
    this.batteryDispatch=new BatteryDispatchSystem(world,this.metrics);this.batteryDispatch.monitor=monitor;world.batteryDispatch=this.batteryDispatch;
    this.mission=new MissionRuntime(world,level,this.metrics);
    this.technicians=world.technicianSystem||null;
    this.history=[];this.historyTimer=0;this.visualTime=0;
  }

  initialize(){this.energySystem.initialize();}
  setSpeed(v){this.speed=v;}
  togglePause(){this.paused=!this.paused;}

  update(dt){
    if(this.paused||this.mission.state!=='running')return;
    this.monitor?.begin('simulationMs');
    try{let remaining=dt*this.speed;
      while(remaining>0&&!this.paused){
        const untilMidnight=this.datacenter?.clock?(86400-this.datacenter.clock.daySeconds)/360:Infinity;
        const step=Math.min(remaining,untilMidnight);
        this.step(step);
        remaining=Math.max(0,remaining-step);
      }
    }finally{this.monitor?.end('simulationMs');}
  }

  step(dt){
    this.visualTime+=dt;
    const calendarDt=this.datacenter?dt*360:dt;
    this.elapsed+=calendarDt;this.mission.preUpdate(this.elapsed);
    this.world.solarHour=this.datacenter?.clock?.hour??(this.elapsed/3600%24);
    const externalBefore=this.metrics.externalEnergy,generatedBefore=this.metrics.generatedHeat;

    this.monitor?.begin('rackMs');this.world.datacenter?.update(calendarDt);this.technicians?.update(dt);this.monitor?.end('rackMs');
    this.lastPhysicsDt=dt;
    this.monitor?.begin('coolingMs');this.world.datacenter?.protectPower?.(dt,calendarDt);this.monitor?.end('coolingMs');
    this.monitor?.begin('coolingMs');
    if(this.world.datacenter)this.cooling?.applyPowerResult(dt);else this.cooling?.update(dt);
    this.monitor?.end('coolingMs');
    this.monitor?.begin('airflowMs');this.airflow.updateVelocity(dt);this.monitor?.end('airflowMs');
    this.monitor?.begin('thermalMs');this.thermal.update(dt,this.elapsed);this.airflow.advectHeat(dt);this.monitor?.end('thermalMs');
    this.monitor?.begin('coolingMs');this.cooling?.exchangeRooms(dt);this.monitor?.end('coolingMs');
    this.monitor?.begin('fluidMs');this.fluid?.update(dt);this.monitor?.end('fluidMs');
    this.monitor?.begin('airflowMs');this.airflow.applyExhaust(dt);this.monitor?.end('airflowMs');
    if(!this.datacenter)this.batteryDispatch.dispatch(this.level.powerLimit,dt);
    this.energySystem.update(dt,{billingDt:calendarDt});
    this.metrics.externalRejectedPower=(this.metrics.externalEnergy-externalBefore)/dt;
    this.metrics.generatedHeatPower=(this.metrics.generatedHeat-generatedBefore)/dt;
    this.sampleSensors();this.updateMetrics();this.world.datacenter?.afterThermalStep(calendarDt,dt);this.mission.update(dt,this.elapsed);this.captureHistory(dt);
    if(!this.world.datacenter&&this.technicians){const day=Math.floor(this.elapsed/86400);if(day>this.technicians.payrollDay){const wage=this.technicians.settleDay(day);if(wage){this.technicians.build.budget-=wage;this.technicians.build.onChange?.();}}}
  }

  sampleSensors(){for(const s of this.world.entitiesByType('sensor'))if(this.world.inBounds(s.x,s.y))s.sample(this.world.temperatureAt(s.x,s.y));}

  updateMetrics(){
    let sum=this.metrics.airTemperatureSum||0,maxAir=this.metrics.maxAirTemp||0,count=this.metrics.airCellCount||0;
    if(!count){sum=0;maxAir=-Infinity;for(let i=0;i<this.world.size;i++)if(this.world.isAirIndex(i)){const temperature=this.world.temperatureAtIndex(i);sum+=temperature;maxAir=Math.max(maxAir,temperature);count++;}}
    let machineCoolingPower=0,maxMachineTemp=-Infinity,machineCount=0;
    for(const machine of this.world.heatMachines){
      machineCoolingPower+=machine.coolingPower;machine.thermalBalance=machine.coolingPower-machine.heatGenerationPower;
      if(machine.type==='furnace')continue;
      maxMachineTemp=Math.max(maxMachineTemp,machine.temperature);machineCount++;
    }
    this.metrics.machineCoolingPower=machineCoolingPower;
    this.metrics.airTemperatureSum=sum;this.metrics.airCellCount=count;this.metrics.maxAirTemp=count?maxAir:0;
    this.metrics.maxMachineTemp=machineCount?maxMachineTemp:0;
    this.metrics.maxTemp=Math.max(this.metrics.maxAirTemp,this.metrics.maxMachineTemp);
    this.metrics.avgTemp=count?sum/count:0;
    this.metrics.maxTempEver=Math.max(this.metrics.maxTempEver,this.metrics.maxTemp);
    this.metrics.maxPowerEver=Math.max(this.metrics.maxPowerEver,this.metrics.powerDraw);
  }

  captureHistory(dt){
    this.historyTimer+=dt;if(this.historyTimer<1)return;this.historyTimer=0;
    const batteries=this.world.entitiesByType('battery');
    const batteryStoredKWh=batteries.reduce((sum,battery)=>sum+(battery.storedEnergyJ||0)/3_600_000,0);
    const batteryCapacityKWh=batteries.reduce((sum,battery)=>sum+(battery.capacityJ||0)/3_600_000,0);
    const batteryDischargeW=batteries.reduce((sum,battery)=>sum+(battery.enabled?battery.dischargePowerW||0:0),0);
    const batteryChargeW=batteries.reduce((sum,battery)=>sum+(battery.enabled?battery.chargePowerW||0:0),0);
    this.metrics.batteryStoredKWh=batteryStoredKWh;this.metrics.batteryCapacityKWh=batteryCapacityKWh;
    this.metrics.batteryDischargeW=batteryDischargeW;this.metrics.batteryChargeW=batteryChargeW;
    this.history.push({t:this.elapsed,max:this.metrics.maxTemp,avg:this.metrics.avgTemp,power:this.metrics.powerDraw,solarGenerationW:this.metrics.solarGenerationW||0,
      batteryStoredKWh,batteryCapacityKWh,batteryDischargeW,batteryChargeW});
    if(this.history.length>360)this.history.shift();
  }

  totalInternalEnergy(){return this.energySystem.totalInternalEnergy();}
  registerConstruction(before){const after=this.totalInternalEnergy();this.energySystem.registerConstructionDelta(after-before);}
}
