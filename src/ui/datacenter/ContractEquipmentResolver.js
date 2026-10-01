export class ContractEquipmentResolver {
  constructor(world){this.world=world;}
  resolve(contract){
    if(!contract)return [];
    const entities=this.world?.entities||[],byAsset=new Map(entities.filter(entity=>entity.assetId).map(entity=>[entity.assetId,entity]));
    if(contract.modality==='compute'){
      const allocations=contract.commercialResourceSnapshot?.allocations?.length?contract.commercialResourceSnapshot.allocations:contract.allocations||[];
      return [...new Map(allocations.map(item=>byAsset.get(item.assetId)).filter(entity=>entity?.type==='computeRack').map(entity=>[entity.id,entity])).values()];
    }
    return entities.filter(entity=>entity.type==='serverRack'&&entity.contractId===contract.id);
  }
}
