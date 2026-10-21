import { ObjectiveSystem } from './ObjectiveSystem.js';
import { FailureSystem } from './FailureSystem.js';
import { MissionEventSystem } from './MissionEventSystem.js';
import { TEMPERATURE_OBJECTIVES } from './StarRating.js';

// Campaign missions open in a paused planning phase; sandboxes and benchmarks run immediately.
export const usesPlanningPhase=level=>level.planningPhase??(level.campaign!==false&&!level.datacenterSandbox&&!level.performanceBenchmark);

export const PLANNING_MESSAGE='Planejamento · construa com a simulação parada e clique em Iniciar operação';

export class MissionRuntime {
  constructor(world,level,metrics,{planning=false}={}){
    this.world=world;this.level=level;this.metrics=metrics;this.state=planning?'planning':'running';this.holdSeconds=0;this.safeSeconds=0;this.failReason='';this.failure=null;this.elapsed=0;this.minThermalMargin=Infinity;
    this.objectiveStartAt=level.objectiveStartAt??10;
    this.message=planning?PLANNING_MESSAGE:level.startMessage||'Analise a instalação e prepare o sistema.';
    this.objectives=new ObjectiveSystem(world,level,metrics);this.failures=new FailureSystem(world,level);this.events=new MissionEventSystem(world,level);
    this.objectiveStatus=this.objectives.evaluate({waiting:this.waiting});this.lastEventMessage='';
  }
  get waiting(){return this.state==='planning'||(this.state==='running'&&this.elapsed<this.objectiveStartAt);}
  // Ends the planning phase. The preparation countdown is skipped: machines that
  // would wait for it start with the operation, so planning replaces the timer.
  startOperation(){
    if(this.state!=='planning')return false;
    const preparation=this.objectiveStartAt;
    for(const entity of this.world.entities)if(entity.isHeatMachine&&entity.startAt>0&&entity.startAt<=preparation)entity.startAt=0;
    this.state='running';this.objectiveStartAt=0;this.message=this.level.startMessage||'Operação iniciada · mantenha os objetivos estáveis';
    this.objectiveStatus=this.objectives.evaluate({waiting:false});
    return true;
  }
  // Smallest distance to any temperature limit while objectives are active; feeds the star rating.
  trackThermalMargin(){
    for(const status of this.objectiveStatus)if(TEMPERATURE_OBJECTIVES.has(status.type)&&Number.isFinite(status.target)&&Number.isFinite(status.current))this.minThermalMargin=Math.min(this.minThermalMargin,status.target-status.current);
  }
  preUpdate(elapsed){
    const before=this.events.lastAnnouncement;this.events.update(elapsed);
    if(this.events.lastAnnouncement&&this.events.lastAnnouncement!==before)this.lastEventMessage=this.events.lastAnnouncement;
  }
  update(dt,elapsed){
    if(this.state!=='running')return;
    this.elapsed=elapsed;
    this.objectiveStatus=this.objectives.evaluate({waiting:this.waiting});
    const startAt=this.objectiveStartAt;
    if(elapsed<startAt){this.message='Preparação: fontes principais ativam em '+Math.max(0,startAt-elapsed).toFixed(1)+' s';return;}
    const failure=this.failures.update(dt);
    if(failure.failed){
      const entity=failure.entity,zone=failure.zone;
      this.state='failed';this.failReason=failure.reason;this.message='Falha operacional: '+failure.reason;
      this.failure={reason:failure.reason,type:failure.type||null,time:elapsed,entityId:entity?.id??null,entityName:entity?.name||null,zoneId:zone?.id??null,zoneName:zone?.name||null,
        x:entity?entity.x:zone?Math.floor(zone.x+zone.width/2):null,y:entity?entity.y:zone?Math.floor(zone.y+zone.height/2):null};
      return;
    }
    this.trackThermalMargin();
    const allOk=this.objectives.allRequiredOk();
    if(allOk)this.holdSeconds+=dt;else this.holdSeconds=Math.max(0,this.holdSeconds-dt*.25);
    this.safeSeconds=this.holdSeconds;
    const duration=this.level.missionDuration||300;
    if(this.holdSeconds>=duration){this.state='won';this.message='Objetivos estabilizados. Missão concluída.';return;}
    const failedObjective=this.objectives.firstFailure();
    const base=allOk?'Estável por '+this.holdSeconds.toFixed(0)+' / '+duration+' s':(failedObjective?.label||'Ajuste o sistema térmico');
    this.message=this.lastEventMessage?this.lastEventMessage+' · '+base:base;
  }
}
