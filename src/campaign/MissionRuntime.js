import { ObjectiveSystem } from './ObjectiveSystem.js';
import { FailureSystem } from './FailureSystem.js';
import { MissionEventSystem } from './MissionEventSystem.js';

export class MissionRuntime {
  constructor(world,level,metrics){
    this.world=world;this.level=level;this.metrics=metrics;this.state='running';this.holdSeconds=0;this.safeSeconds=0;this.failReason='';
    this.message=level.startMessage||'Analise a instalação e prepare o sistema.';
    this.objectives=new ObjectiveSystem(world,level,metrics);this.failures=new FailureSystem(world,level);this.events=new MissionEventSystem(world,level);
    this.objectiveStatus=this.objectives.evaluate();this.lastEventMessage='';
  }
  preUpdate(elapsed){
    const before=this.events.lastAnnouncement;this.events.update(elapsed);
    if(this.events.lastAnnouncement&&this.events.lastAnnouncement!==before)this.lastEventMessage=this.events.lastAnnouncement;
  }
  update(dt,elapsed){
    if(this.state!=='running')return;
    this.objectiveStatus=this.objectives.evaluate();
    const startAt=this.level.objectiveStartAt??10;
    if(elapsed<startAt){this.message='Preparação: fontes principais ativam em '+Math.max(0,startAt-elapsed).toFixed(1)+' s';return;}
    const failure=this.failures.update(dt);
    if(failure.failed){this.state='failed';this.failReason=failure.reason;this.message='Falha operacional: '+failure.reason;return;}
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
