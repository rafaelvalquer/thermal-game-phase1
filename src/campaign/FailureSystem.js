import { zoneStats, entityMatches } from './ZoneUtils.js';

export class FailureSystem {
  constructor(world,level){
    this.world=world;this.level=level;this.timers=new Map();
  }

  update(dt){
    for(let i=0;i<(this.level.failures||[]).length;i++){
      const def=this.level.failures[i],key=def.id||'failure-'+i;
      const hit=this.evaluate(def),prev=this.timers.get(key)||0,next=hit.ok?prev+dt:Math.max(0,prev-dt*.5);
      this.timers.set(key,next);
      if(hit.ok&&next>=(def.hold||0))return {failed:true,reason:def.message||hit.reason||'Condição crítica atingida.'};
    }
    return {failed:false};
  }

  evaluate(def){
    if(def.type==='machineOverheat'){
      const list=this.world.entities.filter(e=>e.isHeatMachine&&entityMatches(e,def.filter));
      const bad=list.find(e=>e.temperature>def.temperature);
      return {ok:!!bad,reason:bad?bad.name+' permaneceu acima de '+def.temperature+'°C.':''};
    }
    if(def.type==='zoneOverheat'){
      const zone=this.level.zones.find(z=>z.id===def.zoneId),stats=zone?zoneStats(this.world,zone):{max:0};
      return {ok:stats.max>def.temperature,reason:(zone?.name||def.zoneId)+' excedeu '+def.temperature+'°C.'};
    }
    if(def.type==='entityLimits'){
      const bad=this.world.entities.find(e=>e.failureTemperature&&typeof e.temperature==='number'&&e.temperature>e.failureTemperature);
      return {ok:!!bad,reason:bad?bad.name+' excedeu o limite de '+bad.failureTemperature+'°C.':''};
    }
    if(def.type==='powerOverload')return {ok:this.level.powerLimit&&this.level.powerLimit>0&&this.level.powerLimit<def.threshold};
    return {ok:false};
  }
}
