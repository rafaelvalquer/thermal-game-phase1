import { Technician } from '../entities/Technician.js';

const DIRECTIONS=[[1,0],[0,1],[-1,0],[0,-1]];
export const TECHNICIAN_HIRE_COST=2000;
export const TECHNICIAN_DAILY_WAGE=250;

export class TechnicianSystem {
  constructor(world,build){this.world=world;this.build=build;this.scanTimer=0;this.payrollDay=0;}
  get workers(){return this.world.entitiesByType('technician');}
  get maxWorkers(){const racks=this.world.entitiesByType('serverRack').length;return racks?Math.max(1,Math.ceil(racks/6)):0;}
  get payroll(){return this.workers.length*TECHNICIAN_DAILY_WAGE;}
  hire(){
    if(!this.maxWorkers)return {ok:false,reason:'É necessário ter racks para contratar técnicos.'};
    if(this.workers.length>=this.maxWorkers)return {ok:false,reason:'Limite de técnicos atingido: 1 para cada 6 racks.'};
    if(this.build.budget<TECHNICIAN_HIRE_COST)return {ok:false,reason:'Orçamento insuficiente para contratar um técnico.'};
    const rack=this.world.entitiesByType('serverRack')[0],position=this.nearestFree(rack?.x??0,rack?.y??0,true);
    if(!position)return {ok:false,reason:'Não há espaço livre para iniciar a patrulha.'};
    const worker=this.world.addEntity(new Technician(position.x,position.y));
    worker.staffId='tech-'+worker.id;this.build.budget-=TECHNICIAN_HIRE_COST;this.build.onChange?.();this.world.datacenter?.persist();return {ok:true,worker};
  }
  fire(id){const worker=this.workers.find(item=>String(item.id)===String(id)||item.staffId===id);if(!worker)return false;this.world.removeEntity(worker);this.build.onChange?.();this.world.datacenter?.persist();return true;}
  nearestFree(x,y,adjacentOnly=false){
    let best=null,bestDistance=Infinity;
    for(let yy=0;yy<this.world.height;yy++)for(let xx=0;xx<this.world.width;xx++){
      if(!this.walkable(xx,yy)||this.workers.some(worker=>worker.x===xx&&worker.y===yy))continue;
      const distance=Math.abs(xx-x)+Math.abs(yy-y);if(adjacentOnly&&distance>1)continue;
      if(distance<bestDistance){best={x:xx,y:yy};bestDistance=distance;}
    }
    return best;
  }
  walkable(x,y,exceptWorker=null){return this.world.isAir(x,y)&&!this.world.entityAt(x,y)&&!this.workers.some(w=>w!==exceptWorker&&w.x===x&&w.y===y);}
  update(dt){
    if(!(dt>0))return;
    for(const entity of this.world.entities)if(entity.staffBoostRemaining>0)entity.staffBoostRemaining=Math.max(0,entity.staffBoostRemaining-dt);
    for(const worker of this.workers){
      if(worker.action==='working'){
        worker.boostRemaining=Math.max(0,(worker.boostRemaining||0)-dt);
        worker.workProgress=Math.max(0,Math.min(1,1-worker.boostRemaining/8));
        const rack=this.world.entities.find(e=>e.id===worker.targetRackId);
        if(rack)rack.staffBoostRemaining=worker.boostRemaining;
        if(worker.boostRemaining<=0){worker.workProgress=1;worker.action='cooldown';worker.cooldownRemaining=20;worker.targetRackId=null;worker.path=[];continue;}
        else{if(rack)this.faceRack(worker,rack);continue;}
      }
      worker.cooldownRemaining=Math.max(0,(worker.cooldownRemaining||0)-dt);
      if(worker.action==='moving'&&worker.targetRackId){
        const rack=this.world.entities.find(e=>e.id===worker.targetRackId);
        if(!rack){worker.targetRackId=null;worker.action='patrolling';worker.path=[];}
        else if(worker.x===worker.goalX&&worker.y===worker.goalY){
          this.faceRack(worker,rack);
          if(worker.cooldownRemaining<=0){worker.action='working';worker.boostRemaining=8;worker.workProgress=0;rack.staffBoostRemaining=8;worker.path=[];continue;}
          worker.targetRackId=null;worker.action='patrolling';worker.path=[];
        }
      }
      if(!worker.path?.length){
        const hot=this.hottestReachable(worker);
        if(hot){worker.targetRackId=hot.rack.id;worker.goalX=hot.goal.x;worker.goalY=hot.goal.y;worker.path=hot.path;worker.pathIndex=0;worker.action='moving';}
        else this.choosePatrol(worker);
      }
      this.move(worker,dt);
    }
    this.scanTimer+=dt;if(this.scanTimer>=1){this.scanTimer=0;}
  }
  hottestReachable(worker){
    if(worker.cooldownRemaining>0)return null;
    const candidates=this.world.entitiesByType('serverRack').filter(r=>r.temperature>Math.max(35,Number(r.slaTemperature)||35)&&!(r.staffBoostRemaining>0)&&!this.workers.some(other=>other!==worker&&other.targetRackId===r.id));
    candidates.sort((a,b)=>b.temperature-a.temperature);
    for(const rack of candidates){
      const face=rack.airExhaustDirection||{x:0,y:1},goals=[{x:rack.x+face.x,y:rack.y+face.y},...DIRECTIONS.map(([dx,dy])=>({x:rack.x+dx,y:rack.y+dy}))];
      for(const goal of goals){if(!this.walkable(goal.x,goal.y,worker))continue;
        const path=this.findPath(worker.x,worker.y,goal.x,goal.y);if(path)return {rack,path,goal};}
    }
    return null;
  }
  findPath(sx,sy,gx,gy){
    const start=sy*this.world.width+sx,goal=gy*this.world.width+gx,queue=[start],prev=new Map([[start,-1]]);
    while(queue.length){const i=queue.shift();if(i===goal)break;const x=i%this.world.width,y=Math.floor(i/this.world.width);
      for(const [dx,dy] of DIRECTIONS){const nx=x+dx,ny=y+dy;if(!this.walkable(nx,ny))continue;const ni=ny*this.world.width+nx;if(prev.has(ni))continue;prev.set(ni,i);queue.push(ni);}}
    if(!prev.has(goal))return null;if(goal===start)return [];const path=[];for(let i=goal;i!==start;i=prev.get(i))path.push({x:i%this.world.width,y:Math.floor(i/this.world.width)});return path.reverse();
  }
  choosePatrol(worker){
    const reachable=new Set(this.reachableCells(worker).map(point=>point.y*this.world.width+point.x)),targets=new Map();
    for(const rack of this.world.entitiesByType('serverRack'))for(const [dx,dy] of DIRECTIONS){
      const x=rack.x+dx,y=rack.y+dy,key=y*this.world.width+x;
      if(reachable.has(key)&&this.walkable(x,y,worker))targets.set(key,{x,y});
    }
    const patrolPoints=[...targets.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
    if(!patrolPoints.length){worker.path=[];worker.pathIndex=0;worker.moveProgress=0;worker.goalX=worker.x;worker.goalY=worker.y;worker.action='patrolling';return;}
    for(let attempt=0;attempt<patrolPoints.length;attempt++){
      const index=(worker.patrolIndex||0)%patrolPoints.length;worker.patrolIndex=(index+1)%patrolPoints.length;
      const goal=patrolPoints[index];if(goal.x===worker.x&&goal.y===worker.y)continue;
      const path=this.findPath(worker.x,worker.y,goal.x,goal.y);
      if(path?.length){worker.path=path;worker.pathIndex=0;worker.goalX=goal.x;worker.goalY=goal.y;worker.action='patrolling';return;}
    }
    worker.path=[];worker.pathIndex=0;worker.goalX=worker.x;worker.goalY=worker.y;worker.action='patrolling';
  }
  reachableCells(worker){
    const start=worker.y*this.world.width+worker.x,queue=[start],seen=new Set([start]),cells=[];
    for(let head=0;head<queue.length;head++){const i=queue[head],x=i%this.world.width,y=Math.floor(i/this.world.width);cells.push({x,y});
      for(const [dx,dy] of DIRECTIONS){const nx=x+dx,ny=y+dy;if(!this.walkable(nx,ny,worker))continue;const ni=ny*this.world.width+nx;if(seen.has(ni))continue;seen.add(ni);queue.push(ni);}}
    return cells;
  }
  faceRack(worker,rack){const dx=rack.x-worker.x,dy=rack.y-worker.y;worker.facing=Math.abs(dx)>Math.abs(dy)?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};}
  move(worker,dt){
    const next=worker.path?.[worker.pathIndex];if(!next)return;
    if(!worker.toX&&!worker.toY){worker.toX=worker.x;worker.toY=worker.y;}
    if(worker.moveProgress<=0){if(!this.walkable(next.x,next.y,worker)){worker.path=[];worker.moveProgress=0;worker.action='patrolling';return;}worker.fromX=worker.x;worker.fromY=worker.y;worker.toX=next.x;worker.toY=next.y;worker.facing={x:Math.sign(next.x-worker.x),y:Math.sign(next.y-worker.y)};}
    worker.moveProgress=(worker.moveProgress||0)+dt*Math.max(.2,worker.moveSpeed||1.15);
    if(worker.moveProgress>=1){worker.x=worker.toX;worker.y=worker.toY;worker.moveProgress=0;worker.pathIndex++;if(worker.pathIndex>=worker.path.length){worker.path=[];worker.pathIndex=0;}}
  }
  settleDay(day){if(day<=this.payrollDay)return 0;this.payrollDay=day;return this.payroll;}
}
