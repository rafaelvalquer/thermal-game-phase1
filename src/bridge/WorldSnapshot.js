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
    // Mirror CoolingNetworkBuilder's four-sided tile adjacency in the render snapshot.
    // Hydraulic pipes are deliberately excluded so crossing systems never join visually.
    const airDucts=records.filter(record=>record.type==='duct'),ductAt=new Map(airDucts.map(record=>[`${record.x},${record.y}`,record]));
    const airTerminals=new Map();
    for(const record of records){if(!['coolingUnit','supplyVent'].includes(record.type))continue;
      const direction=record.direction||{x:1,y:0},dx=Math.sign(direction.x||0)||(!direction.y?1:0),dy=Math.sign(direction.y||0),length=Math.max(1,Math.floor(record.footprintLength||1));
      for(let offset=0;offset<length;offset++){
        const x=record.x+dx*offset,y=record.y+dy*offset,key=`${x},${y}`,items=airTerminals.get(key)||[];items.push(record.type);airTerminals.set(key,items);
      }
    }
    const cardinal=[{dx:1,dy:0,name:'east'},{dx:-1,dy:0,name:'west'},{dx:0,dy:1,name:'south'},{dx:0,dy:-1,name:'north'}];
    for(const duct of airDucts){duct.ductConnections=[];
      for(const side of cardinal){const key=`${duct.x+side.dx},${duct.y+side.dy}`;
        if(ductAt.has(key))duct.ductConnections.push({direction:side.name,type:'duct'});
        else for(const type of airTerminals.get(key)||[])duct.ductConnections.push({direction:side.name,type});
      }
      const directions=new Set(duct.ductConnections.map(connection=>connection.direction));
      const count=directions.size;
      duct.ductShape=count>=4?'cross':count===3?'tee':count===2
        ?(directions.has('east')&&directions.has('west')||directions.has('north')&&directions.has('south')?'straight':'curve')
        :count===1?'end':'isolated';
    }
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
