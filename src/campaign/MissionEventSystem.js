import { entityMatches } from './ZoneUtils.js';

export class MissionEventSystem {
  constructor(world,level){
    this.world=world;this.level=level;this.fired=new Set();this.lastAnnouncement='';
  }

  update(elapsed){
    for(let i=0;i<(this.level.events||[]).length;i++){
      const event=this.level.events[i],id=event.id||'event-'+i;
      if(this.fired.has(id)||elapsed<event.time)continue;
      this.apply(event);this.fired.add(id);
      this.lastEvent={event,targets:this.targets(event),time:elapsed,expires:elapsed+6};
      this.lastAnnouncement=event.message||this.describe(event);
    }
  }

  targets(event){
    const filter=event.filter||{};
    return this.world.entities.filter(e=>entityMatches(e,filter));
  }

  apply(event){
    if(event.type==='machineLoad'){
      for(const e of this.targets(event))if(e.isHeatMachine)e.loadMultiplier=(e.loadMultiplier||1)*(event.multiplier||1);
    } else if(event.type==='activateMachine'){
      for(const e of this.targets(event)){e.enabled=true;e.startAt=0;e.started=true;}
    } else if(event.type==='outdoorTemperature'){
      this.world.environment.temperature=event.value;
    } else if(event.type==='toggleEntity'){
      for(const e of this.targets(event))e.enabled=event.enabled!==false;
    }
  }

  describe(event){
    if(event.type==='machineLoad')return 'Pico de carga térmica: ×'+event.multiplier+'.';
    if(event.type==='outdoorTemperature')return 'Temperatura externa alterada para '+event.value+'°C.';
    if(event.type==='activateMachine')return 'Novo processo entrou em operação.';
    return 'Evento operacional.';
  }
}
