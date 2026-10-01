import { createLevelEntity } from '../campaign/LevelManager.js';
import { HeatExchanger } from '../entities/HeatExchanger.js';
import { Radiator } from '../entities/Radiator.js';
import { migrateCoolingUnitBalance } from '../entities/CoolingUnitModels.js';
import { TILE_VOLUME } from '../utils/Constants.js';

const STORAGE_KEY='thermal-lab-datacenter-sandbox-v1';
const EXCLUDED_KEYS=new Set(['id','world']);
const memoryStorage=new Map();
const now=()=>globalThis.performance?.now?.()??Date.now();
const DB_NAME='thermal-game-save-v2',DB_STORE='snapshots';

const storageDefault=()=>{
  try{return globalThis.localStorage||null;}catch{return null;}
};

function copySerializable(value,depth=0){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(value===undefined||depth>8)return undefined;
  if(Array.isArray(value))return value.map(item=>copySerializable(item,depth+1)).filter(item=>item!==undefined);
  if(Object.getPrototypeOf(value)!==Object.prototype)return undefined;
  const result={};
  for(const key in value){
    if(key==='world')continue;
    const item=value[key];
    if(item===null||typeof item==='string'||typeof item==='boolean'){result[key]=item;continue;}
    if(typeof item==='number'){result[key]=Number.isFinite(item)?item:null;continue;}
    const copy=copySerializable(item,depth+1);if(copy!==undefined)result[key]=copy;
  }
  return result;
}

function serializeEntity(entity){
  const properties={};
  for(const key in entity){
    if(EXCLUDED_KEYS.has(key))continue;
    const value=entity[key];
    if(value===null||typeof value==='string'||typeof value==='boolean'){properties[key]=value;continue;}
    if(typeof value==='number'){properties[key]=Number.isFinite(value)?value:null;continue;}
    const copy=copySerializable(value);if(copy!==undefined)properties[key]=copy;
  }
  return {type:entity.type,x:entity.x,y:entity.y,properties};
}

function estimateSnapshotBytes(snapshot){
  const world=snapshot?.world||{},build=snapshot?.build||{};
  return (world.materials?.length||0)*2+(world.energy?.length||0)*8+(world.entities?.length||0)*1200+
    (world.utilities?.length||0)*320+Object.keys(snapshot?.state||{}).length*128+
    (build.placedEntities?.length||0)*48+(build.placedMaterials?.length||0)*32+4096;
}

export class DataCenterSaveSystem {
  constructor({storage=storageDefault(),indexedDB=globalThis.indexedDB,key=STORAGE_KEY}={}){
    this.storage=storage;this.indexedDB=indexedDB;this.key=key;this.lastSavedBytes=0;this.initialSnapshot=undefined;this.dbPromise=null;
    this.queuedSnapshot=null;this.writePromise=null;
  }
  load(){
    if(this.initialSnapshot!==undefined)return this.initialSnapshot;
    return this.loadLegacy();
  }
  loadLegacy(){
    try{
      const raw=this.storage?this.storage.getItem(this.key):memoryStorage.get(this.key);
      if(!raw)return null;
      const value=JSON.parse(raw);if(value?.version===1){this.lastSavedBytes=typeof TextEncoder!=='undefined'?new TextEncoder().encode(raw).byteLength:raw.length;this.lastSavedBytesEstimated=false;return value;}return null;
    }catch{return null;}
  }
  openDatabase(){
    if(!this.indexedDB?.open)return Promise.resolve(null);
    if(this.dbPromise)return this.dbPromise;
    this.dbPromise=new Promise((resolve,reject)=>{
      let request;try{request=this.indexedDB.open(DB_NAME,1);}catch(error){reject(error);return;}
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE);};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error('IndexedDB indisponível.'));
    }).catch(()=>null);
    return this.dbPromise;
  }
  readIndexedDB(db){
    return new Promise((resolve,reject)=>{
      let request;try{request=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(this.key);}catch(error){reject(error);return;}
      request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error||new Error('Falha ao ler o salvamento.'));
    });
  }
  async loadAsync(){
    const legacy=this.loadLegacy(),db=await this.openDatabase();
    if(!db){this.initialSnapshot=legacy;return legacy;}
    try{
      const record=await this.readIndexedDB(db),saved=record?.snapshot;
      const legacyRevision=Number(legacy?.state?.saveRevision)||0,savedRevision=Number(saved?.state?.saveRevision)||0;
      const snapshot=legacy&&legacyRevision>savedRevision?legacy:(saved?.version===1?saved:legacy);
      this.initialSnapshot=snapshot;
      if(snapshot===legacy&&legacy&&(legacyRevision>savedRevision||!saved))await this.saveAsync(legacy);
      if(record?.bytes)this.lastSavedBytes=record.bytes;
      return snapshot;
    }catch{this.initialSnapshot=legacy;return legacy;}
  }
  writeIndexedDB(db,value){
    return new Promise((resolve,reject)=>{
      let tx;try{tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put({snapshot:value,bytes:this.lastSavedBytes},this.key);}
      catch(error){reject(error);return;}
      tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error||new Error('Falha ao gravar o salvamento.'));tx.onabort=()=>reject(tx.error||new Error('Gravação cancelada.'));
    });
  }
  saveAsync(value){
    if(!this.indexedDB?.open)return Promise.resolve(this.save(value));
    this.lastSavedBytes=Math.round(estimateSnapshotBytes(value));this.lastSavedBytesEstimated=true;this.lastSerializeMs=0;this.lastStorageMs=0;
    this.queuedSnapshot=value;
    if(this.writePromise)return this.writePromise;
    this.writePromise=(async()=>{
      let saved=true,db=await this.openDatabase();
      while(this.queuedSnapshot){
        const snapshot=this.queuedSnapshot;this.queuedSnapshot=null;
        if(!db){saved=this.save(snapshot);continue;}
        try{await this.writeIndexedDB(db,snapshot);}
        catch{db=null;saved=this.save(snapshot);}
      }
      return saved;
    })().finally(()=>{this.writePromise=null;});
    return this.writePromise;
  }
  save(value){
    try{
      let started=now();
      const raw=JSON.stringify(value);
      this.lastSerializeMs=Math.max(0,now()-started);started=now();
      if(this.storage)this.storage.setItem(this.key,raw);else memoryStorage.set(this.key,raw);
      this.lastStorageMs=Math.max(0,now()-started);
      this.lastSavedBytes=typeof TextEncoder!=='undefined'?new TextEncoder().encode(raw).byteLength:raw.length;
      this.lastSavedBytesEstimated=false;
      return true;
    }catch{return false;}
  }
  clear(){
    try{if(this.storage)this.storage.removeItem(this.key);else memoryStorage.delete(this.key);return true;}catch{return false;}
  }
  async clearAsync(){
    if(this.writePromise)await this.writePromise;
    const db=await this.openDatabase();this.clear();this.initialSnapshot=null;
    if(!db)return true;
    return new Promise(resolve=>{
      try{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(this.key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}
      catch{resolve(false);}
    });
  }
  capture(world,state,build){
    const started=now(),phases={};let phase=now();
    const snapshot={version:1,state:copySerializable(state),world:{width:world.width,height:world.height},build:{budget:build.budget}};
    phases.state=now()-phase;phase=now();
    snapshot.world.materials=Array.from(world.material);snapshot.world.energy=Array.from(world.energy);phases.tiles=now()-phase;phase=now();
    snapshot.world.entities=world.entities.map(serializeEntity);phases.entities=now()-phase;phase=now();
    const utilities=[];for(const utility of world.utilityById.values())utilities.push(serializeEntity(utility));snapshot.world.utilities=utilities;phases.utilities=now()-phase;phase=now();
    snapshot.build.inventory=Object.fromEntries(Object.entries(build.inventory).map(([key,value])=>[key,Number.isFinite(value)?value:null]));
    snapshot.build.placedEntities=world.entities.flatMap(entity=>{const item=build.placedEntities.get(entity.id);return item?[{x:entity.x,y:entity.y,type:entity.type,...item}]:[];});
    snapshot.build.placedMaterials=Array.from(build.placedMaterials,([index,item])=>({index,...item}));phases.build=now()-phase;
    this.lastCapturePhases=phases;this.lastCaptureMs=Math.max(0,now()-started);return snapshot;
  }
  restoreWorld(world,snapshot,{migrateOpenTerrain=false}={}){
    if(!snapshot?.world)return false;
    const saved=snapshot.world,sourceWidth=Number(saved.width)||((saved.materials?.length===112*72)?112:world.width),sourceHeight=Number(saved.height)||Math.ceil((saved.materials?.length||0)/sourceWidth);
    const sameSize=sourceWidth===world.width&&sourceHeight===world.height;
    if(!migrateOpenTerrain){
      if(sameSize){world.material.set(saved.materials);world.energy.set(saved.energy);}
      else for(let y=0;y<Math.min(sourceHeight,world.height);y++)for(let x=0;x<Math.min(sourceWidth,world.width);x++){
        const from=y*sourceWidth+x,to=y*world.width+x;if(from>=saved.materials.length)continue;
        world.material[to]=saved.materials[from];world.energy[to]=saved.energy?.[from]??world.energy[to];
      }
    }else if(!sameSize){
      for(let y=0;y<Math.min(sourceHeight,world.height);y++)for(let x=0;x<Math.min(sourceWidth,world.width);x++){
        const from=y*sourceWidth+x,to=y*world.width+x;if(from>=saved.materials.length)continue;
        const oldMaterial=world.registry.fromIndex(saved.materials[from]),oldCapacity=Math.max(.001,(oldMaterial?.density||1.225)*TILE_VOLUME*(oldMaterial?.heatCapacity||1005));
        const temp=(saved.energy?.[from]||0)/oldCapacity;if(Number.isFinite(temp))world.energy[to]=world.capacityAtIndex(to)*temp;
      }
      for(const item of snapshot.build?.placedMaterials||[]){
        const oldIndex=Number(item.index);if(!Number.isInteger(oldIndex)||oldIndex<0)continue;
        const x=oldIndex%sourceWidth,y=Math.floor(oldIndex/sourceWidth);if(!world.inBounds(x,y))continue;
        const id=world.registry.fromIndex(saved.materials[oldIndex])?.id||'air';if(id!=='air')world.setMaterial(x,y,id);
      }
    }else {world.material.set(saved.materials);world.energy.set(saved.energy);}
    world.rebuildMaterialProperties();
    world.airTopologyVersion++;
    world.clearEntities();world.clearUtilities();
    for(const definition of snapshot.world.entities||[]){
      const properties={...(definition.properties||{})};
      if(definition.type==='coolingUnit')Object.assign(properties,migrateCoolingUnitBalance(properties));
      if(definition.type==='solarPanel')properties.generationW=0;
      if(definition.type==='serverRack'&&properties.thermalViolationSeconds!==undefined&&!properties.thermalViolationTimebase){
        properties.thermalViolationSeconds=Math.max(0,Number(properties.thermalViolationSeconds)||0)/360;
        properties.thermalViolationTimebase='simulation';
      }
      if(definition.type==='technician'&&properties.action==null){
        properties.action='patrolling';properties.targetRackId=null;properties.boostRemaining=0;
        properties.staffBoostRemaining=0;properties.workProgress=0;properties.boostedEntityId=null;
      }
      if(definition.type==='exchanger'&&(Number(properties.thermalTransferRevision)||0)<HeatExchanger.PERFORMANCE_REVISION){
        properties.ua=HeatExchanger.WATER_UA;
        properties.airUA=HeatExchanger.AIR_UA;
        properties.thermalTransferRevision=HeatExchanger.PERFORMANCE_REVISION;
      }
      if(definition.type==='radiator'&&(Number(properties.thermalTransferRevision)||0)<Radiator.PERFORMANCE_REVISION){
        properties.ua=Radiator.WATER_UA;properties.ratedCapacity=Radiator.RATED_CAPACITY;properties.minimumApproach=Radiator.MINIMUM_APPROACH;properties.power=Radiator.FAN_POWER;properties.fanAirflow=2.5;properties.thermalTransferRevision=Radiator.PERFORMANCE_REVISION;
        if(properties.outdoor==null)properties.outdoor=definition.x===0||definition.y===0||definition.x===world.width-1||definition.y===world.height-1;
      }
      if(definition.type==='pump'&&properties.maxFlowRate==null){properties.maxFlowRate=1.5;properties.maxFlowRateBoost=2;properties.flowMode='normal';}
      const entity=createLevelEntity({type:definition.type,x:definition.x,y:definition.y,...properties});
      if(!entity)continue;Object.assign(entity,properties);entity.normalizeAirflowDirections?.();world.addEntity(entity);
    }
    for(const definition of snapshot.world.utilities||[]){
      const entity=createLevelEntity({type:definition.type,x:definition.x,y:definition.y,...definition.properties});
      if(!entity)continue;Object.assign(entity,definition.properties||{});world.addUtility(entity);
    }
    world.airTopologyVersion++;world.bumpUtilityTopology();
    return true;
  }
  restoreBuild(build,snapshot){
    if(!snapshot?.build)return false;
    build.budget=snapshot.build.budget;
    build.inventory=build.unlimitedInventory
      ?Object.fromEntries(Object.keys(build.catalog).map(key=>[key,Infinity]))
      :Object.fromEntries(Object.keys(build.catalog).map(key=>[key,['battery','solarPanel'].includes(key)?Infinity:(snapshot.build.inventory?.[key]===null?Infinity:snapshot.build.inventory?.[key]??(key==='waterChiller'?(build.catalog[key]?.inventory??1):0))]));
    build.initialInventory={...build.inventory};
    build.placedEntities.clear();
    for(const item of snapshot.build.placedEntities||[]){
      const entity=build.world.entities.find(candidate=>candidate.x===item.x&&candidate.y===item.y&&candidate.type===item.type);
      if(entity)build.placedEntities.set(entity.id,{tool:item.tool,cost:item.cost});
    }
    const oldWidth=Number(snapshot.world?.width)||112;
    build.placedMaterials=new Map((snapshot.build.placedMaterials||[]).map(({index,tool,cost})=>{
      const oldIndex=Number(index),x=oldIndex%oldWidth,y=Math.floor(oldIndex/oldWidth);return [y*build.world.width+x,{tool,cost}];
    }).filter(([index])=>index>=0&&index<build.world.size));
    return true;
  }
}
