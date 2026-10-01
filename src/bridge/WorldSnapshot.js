const stableId=item=>String(item?.assetId??item?.id??item?.utilityId??'');
const numeric=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const statusOf=item=>{
  if(item?.powerBlocked)return 'blocked';
  if(item?.enabled===false)return 'off';
  const status=String(item?.status||item?.networkStatus||'').toLowerCase();
  if(status.includes('fail')||status.includes('fault')||status.includes('violat')||status==='critical'||status==='hot'||status==='overload')return 'alarm';
  if(status.includes('high load')||status.includes('high resistance'))return 'warning';
  if(status.includes('disconnect'))return 'disconnected';
  return 'running';
};

export class WorldSnapshot {
  static capture(world,simulation=null,datacenter=null,{version=0,player=null}={}){
    const contracts=datacenter?.state?.contracts||[];
    const contractById=new Map(contracts.map(contract=>[String(contract.id),contract]));
    const cloudContractsByAsset=new Map();
    for(const contract of contracts){
      if(contract.modality!=='compute'||contract.status!=='active')continue;
      for(const allocation of contract.allocations||[]){const key=String(allocation.assetId);const ids=cloudContractsByAsset.get(key)||[];ids.push(String(contract.id));cloudContractsByAsset.set(key,ids);}
    }
    const records=[];
    const append=(item,kind='entity')=>{
      if(!item||item.isTechnician)return;
      const id=stableId(item);if(!id)return;
      const contractIds=new Set();
      if(item.contractId)contractIds.add(String(item.contractId));
      for(const contractId of cloudContractsByAsset.get(id)||[])contractIds.add(contractId);
      const contractNames=[...contractIds].map(contractId=>contractById.get(contractId)?.clientName).filter(Boolean);
      const capacity=item.capacity||{};
      const numericCapacity=Object.fromEntries(Object.entries(capacity).filter(([,value])=>Number.isFinite(Number(value))).map(([key,value])=>[key,Number(value)]));
      records.push({id,type:String(item.type||item.kind||'unknown'),kind,x:numeric(item.x),y:numeric(item.y),
        rotation:item.direction?Math.atan2(numeric(item.direction.x),numeric(item.direction.y)):numeric(item.rotation),
        direction:item.direction||item.airIntakeDirection?{x:numeric((item.direction||item.airIntakeDirection).x),y:numeric((item.direction||item.airIntakeDirection).y)}:null,
        status:statusOf(item),temperature:numeric(item.temperature,numeric(item.inletTemperature,25)),
        inletTemperature:numeric(item.inletTemperature,numeric(item.temperature,25)),powerKW:Number.isFinite(Number(item.currentPowerKW))?Number(item.currentPowerKW):numeric(item.currentPowerW,numeric(item.power))/1000,
        load:numeric(item.cpuLoad,numeric(item.utilization)),utilization:numeric(item.utilization,numeric(item.cpuLoad)),
        contractIds:[...contractIds],contractNames,clientName:item.clientId||contractNames[0]||null,
        specialization:item.specialization||null,modelId:item.modelId||null,capacity:numericCapacity,
        flowRate:numeric(item.flowRate),airflow:numeric(item.airflow,numeric(item.flowRate)),networkStatus:item.networkStatus||item.status||null,
        coolingLoadKW:numeric(item.coolingLoad)/1000,availableCapacityKW:numeric(item.availableCapacity)/1000,
        currentAirFlow:numeric(item.currentAirFlow),fanSpeed:numeric(item.fanSpeed),fanActive:Boolean(item.fanActive),maxAirFlow:numeric(item.maxAirFlow),
        supplyTemperature:numeric(item.supplyTemperature,numeric(item.airTemperature)),
        returnTemperature:numeric(item.returnTemperature),ratedCoolingCapacityKW:numeric(item.ratedCoolingCapacity)/1000,
        ratedPowerKW:numeric(item.maxPowerW,numeric(item.maxPowerKW)*1000)/1000,
        inletAirTemperature:numeric(item.intakeAirTemperature,numeric(item.inletTemperature,25)),
        exhaustAirTemperature:numeric(item.exhaustAirTemperature,numeric(item.exhaustTemperature,25)),
        occupancy:numeric(item.utilization,numeric(item.cpuLoad)),name:item.name||null,footprintLength:numeric(item.footprintLength,1),
        enabled:item.enabled!==false,powerBlocked:Boolean(item.powerBlocked),runtimeId:item.id??null});
    };
    for(const entity of world?.entities||[])append(entity,'entity');
    for(const utility of world?.allUtilities?.()||[])append(utility,'utility');
    const temperatures=new Float32Array(world?.size||0),materialIds=new Array(world?.size||0);
    for(let i=0;i<temperatures.length;i++){
      temperatures[i]=numeric(world.temperatureAtIndex?.(i),25);
      materialIds[i]=world.registry?.fromIndex?.(world.material?.[i])?.id||'air';
    }
    const land=datacenter?.land;
    let ownedTiles=null;
    if(land?.ownedMask)ownedTiles=new Uint8Array(land.ownedMask);
    else if(land?.isOwned){ownedTiles=new Uint8Array(world?.size||0);for(let y=0;y<(world?.height||0);y++)for(let x=0;x<(world?.width||0);x++)ownedTiles[y*world.width+x]=land.isOwned(x,y)?1:0;}
    const sim=simulation||{};
    return {version,createdAt:Date.now(),world:{width:numeric(world?.width),height:numeric(world?.height),tileSize:1,
      materialTopologyVersion:numeric(world?.materialTopologyVersion),entityVisualVersion:numeric(world?.entityVisualVersion),utilityTopologyVersion:numeric(world?.utilityTopologyVersion),landTopologyVersion:numeric(world?.landTopologyVersion),
      materialIds,temperatures,ownedTiles},player:player||WorldSnapshot.defaultSpawn(world,land),equipment:records,
        metrics:{averageTemperature:numeric(sim.metrics?.avgTemp,numeric(sim.metrics?.averageTemperature,25)),maxAirTemperature:numeric(sim.metrics?.maxAirTemp),
        powerKW:numeric(sim.metrics?.powerDraw)/1000,gridCapacityKW:numeric(datacenter?.powerGrid?.capacityKW),
        solarKW:numeric(sim.batteryDispatch?.solarGenerationW)/1000,gridPowerKW:numeric(sim.batteryDispatch?.gridPowerW)/1000,
        alerts:(datacenter?.state?.contracts||[]).filter(contract=>contract.status==='active'&&contract.dailyViolation).length,
        alertEquipmentIds:(datacenter?.state?.contracts||[]).filter(contract=>contract.status==='active'&&contract.dailyViolation).flatMap(contract=>(contract.allocations||[]).map(item=>String(item.assetId)))},
      simulation:{airX:world?.airX||null,airY:world?.airY||null,airVersion:numeric(world?.airTopologyVersion),thermalVersion:numeric(world?.thermalStatisticsVersion)}};
  }

  static defaultSpawn(world,land=null){
    const bounds=land?.bounds?.()||{x:0,y:0,width:world?.width||1,height:world?.height||1};
    return {x:bounds.x+bounds.width/2,y:1.65,z:bounds.y+bounds.height/2};
  }
}
