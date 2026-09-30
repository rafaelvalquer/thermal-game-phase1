export function diagnoseComputeContract(world,contract){
  if(contract?.modality!=='compute')return [];
  const racksByAsset=new Map(world.entitiesByType('computeRack').map(rack=>[rack.assetId,rack])),diagnostics=[];
  for(const allocation of contract.allocations||[])if(!racksByAsset.has(allocation.assetId))diagnostics.push('Equipamento reservado ausente: '+allocation.assetId);
  if(!(contract.allocations||[]).length)diagnostics.push('Contrato sem recursos provisionados.');
  return diagnostics;
}
