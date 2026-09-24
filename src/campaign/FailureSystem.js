import { zoneStats, entityMatches } from './ZoneUtils.js';

export class FailureSystem {
  constructor(world,level){
    this.world=world;this.level=level;this.timers=new Map();
  }

  update(dt){
    for(let i=0;i<(this.level.failures||[]).length;i++){
      const def=this.level.failures[i],key=def.id||'failure-'+i;
      if(['machineOverheat','entityLimits','coolingUnitOverload'].includes(def.type)){
        const affected=this.evaluateEntities(def);
        const active=new Set(affected.map(({entity})=>entity.id));
        for(const entity of this.world.entities){
          const timerKey=key+':'+entity.id,previous=this.timers.get(timerKey)||0;
          const next=active.has(entity.id)?previous+dt:0;
          this.timers.set(timerKey,next);
          const current=affected.find(item=>item.entity.id===entity.id);
          if(current&&next>=(def.hold||0))return {failed:true,reason:def.message||current.reason||'Condição crítica atingida.'};
        }
        continue;
      }
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
    if(def.type==='coolingUnitOverload'){
      const bad=this.world.entities.find(e=>e.type==='coolingUnit'&&e.status==='OVERLOAD');
      return {ok:!!bad,reason:bad?(bad.name||'A unidade')+' permaneceu sobrecarregada.':''};
    }
    if(def.type==='powerOverload')return {ok:this.level.powerLimit&&this.level.powerLimit>0&&this.level.powerLimit<def.threshold};
    return {ok:false};
  }

  evaluateEntities(def){
    if(def.type==='machineOverheat')return this.world.entities
      .filter(e=>e.isHeatMachine&&entityMatches(e,def.filter)&&e.temperature>def.temperature)
      .map(entity=>({entity,reason:entity.name+' permaneceu acima de '+def.temperature+'°C.'}));
    if(def.type==='entityLimits')return this.world.entities
      .filter(e=>e.failureTemperature&&typeof e.temperature==='number'&&e.temperature>e.failureTemperature)
      .map(entity=>({entity,reason:entity.name+' excedeu o limite de '+entity.failureTemperature+'°C.'}));
    if(def.type==='coolingUnitOverload')return this.world.entities
      .filter(entity=>entity.type==='coolingUnit'&&entity.status==='OVERLOAD')
      .map(entity=>({entity,reason:(entity.name||'A unidade')+' permaneceu sobrecarregada. Adicione capacidade ou reduza a carga.'}));
    return [];
  }

  statusFor(entity){
    let status=null;
    for(let i=0;i<(this.level.failures||[]).length;i++){
      const def=this.level.failures[i];
      let threshold=null,matches=false;
      if(def.type==='machineOverheat'){
        threshold=def.temperature;matches=entity.isHeatMachine&&entityMatches(entity,def.filter);
      }else if(def.type==='entityLimits'){
        threshold=entity.failureTemperature;matches=Number.isFinite(threshold);
      }else if(def.type==='coolingUnitOverload'){
        matches=entity.type==='coolingUnit'&&entity.status==='OVERLOAD';
      }
      if(!matches)continue;
      if(Number.isFinite(threshold)&&entity.temperature<=threshold)continue;
      const key=(def.id||'failure-'+i)+':'+entity.id,hold=def.hold||0,remaining=Math.max(0,hold-(this.timers.get(key)||0));
      if(!status||remaining<status.remaining)status={remaining,hold,ratio:hold?1-remaining/hold:1,threshold,label:entity.status};
    }
    return status;
  }
}
