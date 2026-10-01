import { computeLoadDemand, nextComputeLoadPeak } from './ComputeLoadProfiles.js';

export class ComputeLoadSystem {
  constructor(world,contracts=[]){this.world=world;this.contracts=contracts;this.peakCache=new Map();}
  setContracts(contracts){this.contracts=contracts;this.peakCache.clear();}
  profileDemand(profile,hour,day,contractId=''){return computeLoadDemand(profile,hour,day,contractId);}
  nextPeak(contract,hour,day){
    const key=`${day}:${Math.floor(hour*4)}`,cached=this.peakCache.get(contract.id);
    if(cached?.key===key)return cached.value;
    const value=nextComputeLoadPeak(contract.loadProfile||'constant',hour,day,contract.id);this.peakCache.set(contract.id,{key,value});return value;
  }
  update(clock){
    const racks=this.world.entitiesByType('computeRack'),byAsset=new Map(racks.map(rack=>[rack.assetId,{rack,load:0,weight:0,profiles:[]}]));
    for(const contract of this.contracts){
      if(contract.modality!=='compute'||contract.status!=='active')continue;
      const hour=clock?.hour||0,day=clock?.day||1,demand=this.profileDemand(contract.loadProfile,hour,day,contract.id);
      const profileState={contractId:contract.id,clientName:contract.clientName||contract.productName||'Cloud',profile:contract.loadProfile||'constant',demand,nextPeak:this.nextPeak(contract,hour,day)};
      for(const allocation of contract.allocations||[]){
        const entry=byAsset.get(allocation.assetId);if(!entry)continue;
        const capacity=entry.rack.capacity||{};let share=0;
        if(entry.rack.specialization==='cpu')share=Math.max((allocation.vcpu||0)/(capacity.vcpu||1),(allocation.ramGB||0)/(capacity.ramGB||1));
        else if(entry.rack.specialization==='gpu')share=(allocation.gpuDevices?.length||0)/(capacity.gpuCount||1);
        else if(entry.rack.specialization==='storage')share=(allocation.storageTB||0)/(capacity.storageTB||1);
        entry.load+=share*demand;entry.weight+=share;
        if(share>0)entry.profiles.push({...profileState,share});
      }
    }
    for(const {rack,load,weight,profiles} of byAsset.values()){
      rack.computeLoadProfiles=profiles;
      rack.setUtilization(rack.enabled&&weight?Math.max(0,Math.min(1,load)):0);
    }
  }
}
