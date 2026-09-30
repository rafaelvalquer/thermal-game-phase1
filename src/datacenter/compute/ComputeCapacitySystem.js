const computeContracts=contracts=>(contracts||[]).filter(contract=>contract.modality==='compute'&&contract.status==='active');

export class ComputeCapacitySystem {
  constructor(world,contracts=[]){this.world=world;this.contracts=contracts;this.revision=0;this.cachedRevision=-1;this.cached=null;}
  setContracts(contracts){if(this.contracts!==contracts){this.contracts=contracts;this.invalidate();}}
  invalidate(){this.revision++;this.cached=null;}
  racks(){return this.world.entitySetByType?.('computeRack')||this.world.entitiesByType('computeRack');}
  reservationsByRack({excludeContractId=null}={}){
    const result=new Map();
    for(const contract of computeContracts(this.contracts)){
      if(contract.id===excludeContractId)continue;
      for(const allocation of contract.allocations||[]){
        const current=result.get(allocation.assetId)||{vcpu:0,ramGB:0,gpuDevices:[],storageTB:0,contracts:[]};
        current.vcpu+=Number(allocation.vcpu)||0;current.ramGB+=Number(allocation.ramGB)||0;
        current.gpuDevices.push(...(allocation.gpuDevices||[]).map(device=>({...device,contractId:contract.id,clientName:contract.clientName})));
        current.storageTB+=Number(allocation.storageTB)||0;current.contracts.push(contract.id);result.set(allocation.assetId,current);
      }
    }
    return result;
  }
  snapshot(){
    if(this.cached&&this.cachedRevision===this.revision){
      for(const key of ['cpu','ram','gpu','storage'])this.cached[key].utilized=0;
      for(const rack of this.racks()){
        const factor=rack.utilization||0,capacity=rack.capacity||{};
        if(rack.specialization==='cpu'){this.cached.cpu.utilized+=(capacity.vcpu||0)*factor;this.cached.ram.utilized+=(capacity.ramGB||0)*factor;}
        else if(rack.specialization==='gpu')this.cached.gpu.utilized+=(capacity.gpuCount||0)*factor;
        else if(rack.specialization==='storage')this.cached.storage.utilized+=(capacity.storageTB||0)*factor;
      }
      return this.cached;
    }
    const racks=[...this.racks()],reservations=this.reservationsByRack();
    const totals={cpu:{total:0,reserved:0,utilized:0},ram:{total:0,reserved:0,utilized:0},gpu:{total:0,reserved:0,utilized:0,devices:[]},storage:{total:0,reserved:0,utilized:0},racks:{total:racks.length,byModel:{}}};
    for(const rack of racks){
      const capacity=rack.capacity||{},reserved=reservations.get(rack.assetId)||{vcpu:0,ramGB:0,gpuDevices:[],storageTB:0,contracts:[]};
      const modelKey=rack.specialization+':'+rack.modelId;totals.racks.byModel[modelKey]=(totals.racks.byModel[modelKey]||0)+1;
      if(rack.specialization==='cpu'){
        totals.cpu.total+=capacity.vcpu||0;totals.ram.total+=capacity.ramGB||0;
        totals.cpu.reserved+=reserved.vcpu;totals.ram.reserved+=reserved.ramGB;
        totals.cpu.utilized+=(capacity.vcpu||0)*(rack.utilization||0);totals.ram.utilized+=(capacity.ramGB||0)*(rack.utilization||0);
      }else if(rack.specialization==='gpu'){
        totals.gpu.total+=capacity.gpuCount||0;totals.gpu.reserved+=reserved.gpuDevices.length;
        totals.gpu.utilized+=(capacity.gpuCount||0)*(rack.utilization||0);
        for(let slot=0;slot<(capacity.gpuCount||0);slot++){
          const reservation=reserved.gpuDevices.find(device=>device.slot===slot)||null;
          totals.gpu.devices.push({assetId:rack.assetId,slot,vramGB:capacity.vramPerGpuGB||0,reserved:Boolean(reservation),contractId:reservation?.contractId||null,clientName:reservation?.clientName||null});
        }
      }else if(rack.specialization==='storage'){
        totals.storage.total+=capacity.storageTB||0;totals.storage.reserved+=reserved.storageTB;
        totals.storage.utilized+=(capacity.storageTB||0)*(rack.utilization||0);
      }
    }
    for(const key of ['cpu','ram','gpu','storage']){
      const item=totals[key];item.available=Math.max(0,item.total-item.reserved);item.occupancy=item.total?item.reserved/item.total:0;
    }
    totals.cpu.unit='vCPU';totals.ram.unit='GB';totals.gpu.unit='devices';totals.storage.unit='TB';
    this.cached=totals;this.cachedRevision=this.revision;return totals;
  }
  get summary(){return this.snapshot();}
  capacityByAsset({excludeContractId=null}={}){
    const reserved=this.reservationsByRack({excludeContractId}),result=new Map();
    for(const rack of this.racks()){
      const capacity=rack.capacity||{},used=reserved.get(rack.assetId)||{vcpu:0,ramGB:0,gpuDevices:[],storageTB:0,contracts:[]};
      result.set(rack.assetId,{rack,vcpu:Math.max(0,(capacity.vcpu||0)-used.vcpu),ramGB:Math.max(0,(capacity.ramGB||0)-used.ramGB),gpuDevices:Array.from({length:capacity.gpuCount||0},(_,slot)=>({slot,vramGB:capacity.vramPerGpuGB||0})).filter(device=>!used.gpuDevices.some(item=>item.slot===device.slot)),storageTB:Math.max(0,(capacity.storageTB||0)-used.storageTB)});
    }
    return result;
  }
}
