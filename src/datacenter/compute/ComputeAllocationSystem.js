const toRequest=value=>({
  vcpu:Number(value?.vcpu)||0,ramGB:Number(value?.ramGB)||0,gpuCount:Number(value?.gpuCount)||0,
  gpuMinVramGB:Number(value?.gpuMinVramGB)||0,storageTB:Number(value?.storageTB)||0,
});
const equalRequest=(a,b)=>['vcpu','ramGB','gpuCount','gpuMinVramGB','storageTB'].every(key=>(Number(a?.[key])||0)===(Number(b?.[key])||0));

export class ComputeAllocationSystem {
  constructor(capacitySystem){this.capacity=capacitySystem;}
  validate(request){
    const invalid=Object.entries(request).filter(([key,value])=>key!=='gpuMinVramGB'&&(!Number.isInteger(value)||value<0));
    if(invalid.length)return {ok:false,reason:'Os recursos do contrato devem ser quantidades inteiras não negativas.',invalid:invalid.map(([key])=>key)};
    if(!Number.isInteger(request.gpuMinVramGB)||request.gpuMinVramGB<0)return {ok:false,reason:'A VRAM mínima por GPU precisa ser um inteiro não negativo.'};
    if((request.vcpu===0)!==(request.ramGB===0))return {ok:false,reason:'CPU e RAM devem ser solicitadas em conjunto.'};
    return null;
  }
  plan(requirements,{excludeContractId=null}={}){
    const request=toRequest(requirements),invalid=this.validate(request);if(invalid)return {...invalid,request,allocations:[]};
    const available=this.capacity.capacityByAsset({excludeContractId}),allocationByAsset=new Map(),missing=[];
    const allocationFor=assetId=>{let item=allocationByAsset.get(assetId);if(!item)allocationByAsset.set(assetId,item={assetId,vcpu:0,ramGB:0,gpuDevices:[],storageTB:0});return item;};
    let remainingCpu=request.vcpu,remainingRam=request.ramGB;
    const cpuRacks=[...available.values()].filter(item=>item.rack.specialization==='cpu').sort((a,b)=>b.vcpu-a.vcpu||b.ramGB-a.ramGB);
    if(request.vcpu&&request.ramGB){
      for(const item of cpuRacks){
        if(!remainingCpu||!remainingRam)break;
        let cpu=Math.min(item.vcpu,remainingCpu,Math.floor(item.ramGB*request.vcpu/request.ramGB),Math.floor(remainingRam*request.vcpu/request.ramGB));
        while(cpu>0&&Math.ceil(cpu*request.ramGB/request.vcpu)>item.ramGB)cpu--;
        if(cpu<=0)continue;
        const ram=cpu===remainingCpu?remainingRam:Math.ceil(cpu*request.ramGB/request.vcpu);
        if(ram>item.ramGB||ram>remainingRam)continue;
        const allocation=allocationFor(item.rack.assetId);allocation.vcpu+=cpu;allocation.ramGB+=ram;
        item.vcpu-=cpu;item.ramGB-=ram;remainingCpu-=cpu;remainingRam-=ram;
      }
    }else if(request.vcpu){
      for(const item of cpuRacks){const cpu=Math.min(item.vcpu,remainingCpu);if(!cpu)continue;allocationFor(item.rack.assetId).vcpu+=cpu;item.vcpu-=cpu;remainingCpu-=cpu;if(!remainingCpu)break;}
    }else if(request.ramGB){
      for(const item of cpuRacks){const ram=Math.min(item.ramGB,remainingRam);if(!ram)continue;allocationFor(item.rack.assetId).ramGB+=ram;item.ramGB-=ram;remainingRam-=ram;if(!remainingRam)break;}
    }
    if(remainingCpu)missing.push({resource:'CPU',requested:request.vcpu,available:request.vcpu-remainingCpu,missing:remainingCpu});
    if(remainingRam)missing.push({resource:'RAM',requested:request.ramGB,available:request.ramGB-remainingRam,missing:remainingRam});

    let remainingGpu=request.gpuCount;
    const gpuRacks=[...available.values()].filter(item=>item.rack.specialization==='gpu').sort((a,b)=>b.rack.capacity.vramPerGpuGB-a.rack.capacity.vramPerGpuGB||a.gpuDevices.length-b.gpuDevices.length);
    const compatibleGpuCount=gpuRacks.reduce((sum,item)=>sum+item.gpuDevices.filter(device=>device.vramGB>=request.gpuMinVramGB).length,0);
    for(const item of gpuRacks){
      if(!remainingGpu)break;
      const devices=item.gpuDevices.filter(device=>device.vramGB>=request.gpuMinVramGB).slice(0,remainingGpu);
      if(!devices.length)continue;
      allocationFor(item.rack.assetId).gpuDevices.push(...devices.map(device=>({slot:device.slot,vramGB:device.vramGB})));
      item.gpuDevices=item.gpuDevices.filter(device=>!devices.some(used=>used.slot===device.slot));remainingGpu-=devices.length;
    }
    if(remainingGpu)missing.push({resource:'GPU',requested:request.gpuCount,available:compatibleGpuCount,missing:remainingGpu,minVramGB:request.gpuMinVramGB});

    let remainingStorage=request.storageTB;
    const storageRacks=[...available.values()].filter(item=>item.rack.specialization==='storage').sort((a,b)=>b.storageTB-a.storageTB);
    for(const item of storageRacks){const storage=Math.min(item.storageTB,remainingStorage);if(!storage)continue;allocationFor(item.rack.assetId).storageTB+=storage;item.storageTB-=storage;remainingStorage-=storage;if(!remainingStorage)break;}
    if(remainingStorage)missing.push({resource:'Storage',requested:request.storageTB,available:request.storageTB-remainingStorage,missing:remainingStorage});

    const allocations=[...allocationByAsset.values()].filter(item=>item.vcpu||item.ramGB||item.gpuDevices.length||item.storageTB);
    return {ok:missing.length===0,request,allocations,missing,reason:missing.length?'Capacidade computacional insuficiente.':null};
  }
  commit(contract,requirements=contract?.computeRequirements){
    if(!contract)return {ok:false,reason:'Contrato ausente.'};
    const request=toRequest(requirements);
    if(contract.modality==='compute'&&Array.isArray(contract.allocations)&&equalRequest(contract.computeRequirements,request))return {ok:true,alreadyAllocated:true,allocations:contract.allocations};
    const result=this.plan(request,{excludeContractId:contract.id});if(!result.ok)return result;
    contract.modality='compute';contract.computeRequirements=request;contract.allocations=result.allocations;
    this.capacity.invalidate();return {...result,contract};
  }
  release(contract){
    if(!contract||contract.modality!=='compute'||!Array.isArray(contract.allocations)||!contract.allocations.length)return false;
    contract.allocations=[];this.capacity.invalidate();return true;
  }
  allocationsFor(assetId){
    return [...this.capacity.contracts.filter(contract=>contract.modality==='compute'&&contract.status==='active')]
      .flatMap(contract=>(contract.allocations||[]).filter(allocation=>allocation.assetId===assetId).map(allocation=>({contractId:contract.id,clientName:contract.clientName,...allocation})));
  }
  contractsUsingRack(assetId){return [...new Map(this.allocationsFor(assetId).map(item=>[item.contractId,{id:item.contractId,clientName:item.clientName}])).values()];}
  canRemoveRack(assetId){return !this.allocationsFor(assetId).some(allocation=>allocation.vcpu||allocation.ramGB||allocation.gpuDevices.length||allocation.storageTB);}
}
