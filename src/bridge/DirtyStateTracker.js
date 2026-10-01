const WORLD_KEYS=['entityVisualVersion','staticVisualVersion','dynamicVisualVersion','materialTopologyVersion','utilityTopologyVersion','fluidTopologyVersion','landTopologyVersion','navigationTopologyVersion','thermalStatisticsVersion','airTopologyVersion'];

export class DirtyStateTracker {
  constructor(){this.version=0;this.reasons=new Set(['initial']);this.worldVersions=null;this.lastSnapshot=null;}
  mark(reason='world'){this.reasons.add(reason);this.version++;return this.version;}
  observe(world){
    const next=Object.fromEntries(WORLD_KEYS.map(key=>[key,Number(world?.[key])||0]));
    if(!this.worldVersions){this.worldVersions=next;return this.mark('initial');}
    for(const [key,value] of Object.entries(next))if(value!==this.worldVersions[key])this.mark(key);
    this.worldVersions=next;return this.version;
  }
  consume(){const reasons=[...this.reasons];this.reasons.clear();return {version:this.version,reasons};}
  setSnapshot(snapshot){this.lastSnapshot=snapshot;this.reasons.clear();return snapshot;}
  isDirty(){return this.reasons.size>0;}
}
