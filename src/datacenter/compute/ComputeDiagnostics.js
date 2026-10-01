export function diagnoseComputeContract(world,contract){
  if(contract?.modality!=='compute')return [];
  const racksByAsset=new Map(world.entitiesByType('computeRack').map(rack=>[rack.assetId,rack])),diagnostics=[];
  for(const allocation of contract.allocations||[])if(!racksByAsset.has(allocation.assetId))diagnostics.push('Equipamento reservado ausente: '+allocation.assetId);
  const request=contract.computeRequirements||{},allocations=contract.allocations||[];
  const actual=allocations.reduce((sum,item)=>({vcpu:sum.vcpu+(Number(item.vcpu)||0),ramGB:sum.ramGB+(Number(item.ramGB)||0),storageTB:sum.storageTB+(Number(item.storageTB)||0),gpus:[...sum.gpus,...(item.gpuDevices||[])]}),{vcpu:0,ramGB:0,storageTB:0,gpus:[]});
  const missing=[];
  for(const key of ['vcpu','ramGB','storageTB'])if(actual[key]+1e-9<(Number(request[key])||0))missing.push(`${Math.ceil((Number(request[key])||0)-actual[key])} ${key}`);
  const compatible=actual.gpus.filter(device=>(Number(device.vramGB)||0)>=(Number(request.gpuMinVramGB)||0));
  if(compatible.length<(Number(request.gpuCount)||0))missing.push(`${Math.ceil((Number(request.gpuCount)||0)-compatible.length)} GPU(s) com VRAM suficiente`);
  if(missing.length)diagnostics.push('Provisionamento incompleto: faltam '+missing.join(', ')+'.');
  const required=(Number(request.vcpu)||0)+(Number(request.ramGB)||0)+(Number(request.gpuCount)||0)+(Number(request.storageTB)||0);
  if(!required&&allocations.length===0)diagnostics.push('Contrato sem recursos provisionados.');
  return diagnostics;
}
