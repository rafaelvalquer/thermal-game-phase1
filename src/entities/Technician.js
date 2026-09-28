import { Entity } from './Entity.js';

export function technicianAt(world,x,y){
  return world.entities.find(worker=>worker.type==='technician'&&Math.floor((worker.fromX??worker.x)+((worker.toX??worker.x)-(worker.fromX??worker.x))*(worker.moveProgress||0)+.5)===x&&Math.floor((worker.fromY??worker.y)+((worker.toY??worker.y)-(worker.fromY??worker.y))*(worker.moveProgress||0)+.5)===y)||null;
}

export class Technician extends Entity {
  constructor(x,y,options={}){
    super('technician',x,y);
    Object.assign(this,{name:'Técnico',isTechnician:true,moveSpeed:1.15,moveProgress:0,fromX:x,fromY:y,toX:x,toY:y,
      path:[],pathIndex:0,targetRackId:null,action:'patrolling',facing:{x:0,y:1},workProgress:0,
      boostRemaining:0,cooldownRemaining:0,patrolIndex:0,patrolRemaining:0,staffBoostRemaining:0},options);
    // Old saves had an 8 s bonus timer but discarded the rack target. Start those workers idle.
    if(options.action==null){this.action='patrolling';this.targetRackId=null;this.boostRemaining=0;this.staffBoostRemaining=0;this.workProgress=0;this.boostedEntityId=null;}
    this.type='technician';this.isTechnician=true;
  }
}
