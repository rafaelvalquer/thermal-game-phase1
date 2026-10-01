const TAU=Math.PI*2;

export class EquipmentAnimationSystem {
  constructor(){this.phases=new Map();this.elapsed=0;this.blinkOn=true;}
  update(snapshot,dt,factory){
    const seconds=Math.max(0,Math.min(.1,Number(dt)||0));this.elapsed+=seconds;
    const blinkOn=Math.floor(this.elapsed*3)%2===0,activePhases=new Map(),present=new Set();
    for(const record of snapshot.equipment){
      if(record.type!=='coolingUnit')continue;
      present.add(record.id);
      const running=record.enabled&&!record.powerBlocked&&record.fanActive&&record.currentAirFlow>0&&record.fanSpeed>0;
      if(!running||seconds===0)continue;
      const phase=((this.phases.get(record.id)||0)+seconds*(5+record.fanSpeed*20))%TAU;
      this.phases.set(record.id,phase);activePhases.set(record.id,phase);
    }
    for(const id of this.phases.keys())if(!present.has(id))this.phases.delete(id);
    if(activePhases.size||blinkOn!==this.blinkOn)factory.animate(activePhases,blinkOn);
    this.blinkOn=blinkOn;
  }
  dispose(){this.phases.clear();}
}
