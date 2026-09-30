const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));

export class ComputeLoadSystem {
  constructor(world,contracts=[]){this.world=world;this.contracts=contracts;}
  setContracts(contracts){this.contracts=contracts;}
  profileDemand(profile,hour,day,contractId=''){
    const phase=(Number.parseInt(String(contractId).replace(/\D/g,''),10)||0)%17;
    const wave=(offset,period)=>.5+.5*Math.sin((hour+phase/3+offset)*Math.PI*2/period);
    if(profile==='business')return clamp(.2+.65*wave(9,24));
    if(profile==='streaming')return clamp(.18+.68*wave(21,24));
    if(profile==='ai')return clamp(.28+.68*wave(day*.37+phase,7));
    if(profile==='storage')return clamp(.16+.24*wave(hour,24));
    return clamp(.38+.24*wave(day+phase,24));
  }
  update(clock){
    const racks=this.world.entitiesByType('computeRack'),byAsset=new Map(racks.map(rack=>[rack.assetId,{rack,load:0,weight:0}]));
    for(const contract of this.contracts){
      if(contract.modality!=='compute'||contract.status!=='active')continue;
      const demand=this.profileDemand(contract.loadProfile,clock?.hour||0,clock?.day||1,contract.id);
      for(const allocation of contract.allocations||[]){
        const entry=byAsset.get(allocation.assetId);if(!entry)continue;
        const capacity=entry.rack.capacity||{};let share=0;
        if(entry.rack.specialization==='cpu')share=Math.max((allocation.vcpu||0)/(capacity.vcpu||1),(allocation.ramGB||0)/(capacity.ramGB||1));
        else if(entry.rack.specialization==='gpu')share=(allocation.gpuDevices?.length||0)/(capacity.gpuCount||1);
        else if(entry.rack.specialization==='storage')share=(allocation.storageTB||0)/(capacity.storageTB||1);
        entry.load+=share*demand;entry.weight+=share;
      }
    }
    for(const {rack,load,weight} of byAsset.values())rack.setUtilization(rack.enabled&&weight?clamp(load):0);
  }
}
