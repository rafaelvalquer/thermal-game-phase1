export class ContractCapacityPlanner {
  constructor(allocationSystem){this.allocations=allocationSystem;}
  analyze(offer){
    if(offer?.modality!=='compute')return {ok:true,allocations:[],missing:[]};
    return this.allocations.plan(offer.computeRequirements);
  }
}
