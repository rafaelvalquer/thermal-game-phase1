const DIRECTIONS=[[0,-1],[1,0],[0,1],[-1,0]];
import { hotRacks } from '../../datacenter/RackQueries.js';

export class TechnicianDispatcher {
  constructor(system,{interval=1,maxPathAttempts=64}={}){
    this.system=system;this.world=system.world;this.interval=interval;this.maxPathAttempts=maxPathAttempts;this.elapsed=0;this.dispatchCount=0;
  }

  update(dt){
    this.elapsed+=dt;if(this.elapsed+1e-9<this.interval)return false;
    this.elapsed-=this.interval;this.dispatch();return true;
  }

  dispatch(){
    const system=this.system,workers=system.workers;
    system.monitor?.begin?.('technicianDispatchMs');system.monitor?.count?.('technicianDispatchCount');
    try{
      const assigned=new Set(workers.filter(worker=>worker.targetRackId!=null).map(worker=>worker.targetRackId));
      const available=workers.filter(worker=>worker.action!=='working'&&worker.cooldownRemaining<=0&&!worker.targetRackId&&(worker.moveProgress||0)<=0);
      const racks=hotRacks(this.world).filter(rack=>!assigned.has(rack.id)).map(rack=>{
        const limit=Math.max(35,Number(rack.slaTemperature)||35),excess=rack.temperature-limit;
        const powerKW=Number.isFinite(Number(rack.currentPowerKW))?Number(rack.currentPowerKW):Math.max(0,Number(rack.currentPowerW)||Number(rack.power)||0)/1000;
        return {rack,priority:excess*10+(rack.temperature>limit?20:0)+powerKW*.1};
      }).sort((a,b)=>b.priority-a.priority||system.world.entityOrder(a.rack)-system.world.entityOrder(b.rack));
      let attempts=0;
      for(const job of racks){
        if(!available.length||attempts>=this.maxPathAttempts)break;
        const {rack}=job,face=rack.airExhaustDirection||{x:0,y:1};
        const goals=[{x:rack.x+face.x,y:rack.y+face.y},...DIRECTIONS.map(([dx,dy])=>({x:rack.x+dx,y:rack.y+dy}))]
          .filter((goal,index,list)=>list.findIndex(item=>item.x===goal.x&&item.y===goal.y)===index&&system.walkable(goal.x,goal.y));
        let best=null;
        for(const worker of available){
          const distance=Math.abs(worker.x-rack.x)+Math.abs(worker.y-rack.y),score=job.priority-distance*.25;
          if(best&&score<best.score)continue;
          for(const goal of goals){attempts++;if(attempts>this.maxPathAttempts)break;
            const path=system.pathfinder.findPath(worker.x,worker.y,goal.x,goal.y,worker);
            if(path&&(!best||score>best.score||score===best.score&&path.length<best.path.length))best={worker,goal,path,score};
          }
          if(attempts>=this.maxPathAttempts)break;
        }
        if(!best)continue;
        const {worker,goal,path}=best;worker.targetRackId=rack.id;worker.goalX=goal.x;worker.goalY=goal.y;worker.path=path;worker.pathIndex=0;worker.action='moving';
        available.splice(available.indexOf(worker),1);assigned.add(rack.id);
      }

      for(const worker of available){
        if(worker.path?.length)continue;
        system.choosePatrol(worker);
      }
      this.dispatchCount++;
    }finally{system.monitor?.end?.('technicianDispatchMs');}
  }
}
