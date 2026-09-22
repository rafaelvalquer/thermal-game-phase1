import { ThermalSystem } from './ThermalSystem.js';
import { AirflowSystem } from './AirflowSystem.js';
import { FluidSystem } from './FluidSystem.js';
import { EnergySystem } from './EnergySystem.js';
import { MACHINE_FAIL_TEMP, FAIL_HOLD_SECONDS, ROOM_SAFE_TEMP, WIN_HOLD_SECONDS, POWER_LIMIT_W } from '../utils/Constants.js';

export class Simulation {
  constructor(world){
    this.world=world; this.elapsed=0; this.paused=false; this.speed=1;
    this.metrics={ generatedHeat:0, externalEnergy:0, powerDraw:0, powerEnergy:0, energyBalance:0, maxTemp:25, avgTemp:25 };
    this.thermal=new ThermalSystem(world,this.metrics); this.airflow=new AirflowSystem(world,this.metrics); this.fluid=new FluidSystem(world,this.metrics); this.energySystem=new EnergySystem(world,this.metrics);
    this.mission={state:'running',safeSeconds:0,message:'Prepare o sistema. Máquinas ligam em 10 s.', failReason:''};
    this.history=[]; this.historyTimer=0;
  }
  initialize(){ this.energySystem.initialize(); }
  setSpeed(v){this.speed=v;} togglePause(){this.paused=!this.paused;}
  update(dt){
    if(this.paused||this.mission.state!=='running') return;
    dt*=this.speed; this.elapsed+=dt;
    this.thermal.update(dt,this.elapsed); this.airflow.update(dt); this.fluid.update(dt); this.energySystem.update(dt); this.sampleSensors(); this.updateMetrics(); this.updateMission(dt); this.captureHistory(dt);
  }
  sampleSensors(){ for(const s of this.world.entitiesByType('sensor')) if(this.world.inBounds(s.x,s.y)) s.sample(this.world.temperatureAt(s.x,s.y)); }
  updateMetrics(){
    let sum=0,max=-Infinity,count=0; for(let i=0;i<this.world.size;i++){ if(this.world.registry.fromIndex(this.world.material[i]).id!=='air')continue; const t=this.world.temperatureAtIndex(i);sum+=t;max=Math.max(max,t);count++; }
    const mt=this.world.entitiesByType('machine').map(m=>m.temperature); this.metrics.maxTemp=Math.max(max,...mt); this.metrics.avgTemp=count?sum/count:0;
  }
  updateMission(dt){
    const machines=this.world.entitiesByType('machine'); if(this.elapsed<10){this.mission.message=`Máquinas ligam em ${(10-this.elapsed).toFixed(1)} s`;return;}
    let failed=false; for(const m of machines){ if(m.temperature>MACHINE_FAIL_TEMP) m.overheatSeconds+=dt; else m.overheatSeconds=Math.max(0,m.overheatSeconds-dt*.5); if(m.overheatSeconds>=FAIL_HOLD_SECONDS){ failed=true;this.mission.failReason=`${m.name} permaneceu acima de ${MACHINE_FAIL_TEMP}°C.`; } }
    if(failed){this.mission.state='failed';this.mission.message='Falha por superaquecimento.';return;}
    const allSafe=machines.every(m=>m.temperature<ROOM_SAFE_TEMP); const powerOk=this.metrics.powerDraw<=POWER_LIMIT_W;
    if(allSafe&&powerOk) this.mission.safeSeconds+=dt; else this.mission.safeSeconds=Math.max(0,this.mission.safeSeconds-dt*.25);
    if(this.mission.safeSeconds>=WIN_HOLD_SECONDS){this.mission.state='won';this.mission.message='Sistema térmico estabilizado.';return;}
    this.mission.message=allSafe?`Estável por ${this.mission.safeSeconds.toFixed(0)} / ${WIN_HOLD_SECONDS} s`:`Resfrie todas as máquinas para < ${ROOM_SAFE_TEMP}°C`;
  }
  captureHistory(dt){this.historyTimer+=dt;if(this.historyTimer<1)return;this.historyTimer=0;this.history.push({t:this.elapsed,max:this.metrics.maxTemp,avg:this.metrics.avgTemp,power:this.metrics.powerDraw});if(this.history.length>240)this.history.shift();}
  totalInternalEnergy(){return this.energySystem.totalInternalEnergy();}
  registerConstruction(before){const after=this.totalInternalEnergy();this.energySystem.registerConstructionDelta(after-before);}
}
