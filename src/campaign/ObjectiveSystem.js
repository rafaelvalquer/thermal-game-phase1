import { zoneStats, entityMatches } from './ZoneUtils.js';

const fmt=v=>Number(v).toFixed(v<10?1:0);

export class ObjectiveSystem {
  constructor(world,level,metrics){
    this.world=world;this.level=level;this.metrics=metrics;this.status=[];
  }

  evaluate(){
    this.status=(this.level.objectives||[]).map((def,index)=>this.evaluateOne(def,index));
    return this.status;
  }

  evaluateOne(def,index){
    let ok=true,current=null,label=def.label||def.type;
    if(def.type==='machineTemperature'){
      const list=this.world.entities.filter(e=>e.isHeatMachine&&entityMatches(e,def.filter));
      current=list.length?Math.max(...list.map(e=>e.temperature)):0;
      ok=list.length>0&&current<=def.max;
      label=def.label||'Equipamentos < '+def.max+'°C';
    } else if(def.type==='zoneTemperature'){
      const zone=this.level.zones.find(z=>z.id===def.zoneId),stats=zone?zoneStats(this.world,zone):{max:Infinity,average:Infinity};
      current=def.metric==='average'?stats.average:stats.max;ok=current<=def.max;
      label=def.label||(zone?.name||def.zoneId)+' < '+def.max+'°C';
    } else if(def.type==='powerBelow'){
      current=this.metrics.powerDraw;ok=current<=def.max;label=def.label||'Potência < '+(def.max/1000).toFixed(1)+' kW';
    } else if(def.type==='maxAirTemperature'){
      current=this.metrics.maxAirTemp??this.metrics.avgTemp;ok=current<=def.max;label=def.label||'Nenhum hotspot > '+def.max+'°C';
    } else if(def.type==='flowAbove'){
      const list=this.world.entities.filter(e=>['pipe','pump','tank','radiator','exchanger'].includes(e.type)&&entityMatches(e,def.filter));
      current=list.length?Math.max(...list.map(e=>e.flowRate||0)):0;ok=current>=def.min;label=def.label||'Vazão ≥ '+fmt(def.min)+' kg/s';
    } else if(def.type==='coolingCapacityMargin'){
      current=this.metrics.coolingReserveMargin??0;ok=current>=def.min;label=def.label||'Reserva de refrigeração ≥ '+Math.round(def.min*100)+'%';
    } else if(def.type==='activeCoolingUnits'){
      const units=this.world.entitiesByType('coolingUnit');current=units.filter(unit=>unit.enabled&&['READY','PARTIAL LOAD','HIGH LOAD'].includes(unit.status)).length;ok=current>=def.min;label=def.label||'Unidades de refrigeração ativas ≥ '+def.min;
    } else if(def.type==='survive'){
      ok=true;current=null;label=def.label||'Manter operação';
    }
    return {id:def.id||'objective-'+index,type:def.type,label,ok,current,target:def.max??def.min??null,required:def.required!==false};
  }

  allRequiredOk(){return this.status.filter(s=>s.required).every(s=>s.ok);}
  firstFailure(){return this.status.find(s=>s.required&&!s.ok)||null;}
}
