import { createLevelEntity } from '../campaign/LevelManager.js';

const STORAGE_KEY='thermal-lab-datacenter-sandbox-v1';
const EXCLUDED_KEYS=new Set(['id','world']);
const memoryStorage=new Map();

const storageDefault=()=>{
  try{return globalThis.localStorage||null;}catch{return null;}
};

function copySerializable(value,depth=0){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(depth>5)return undefined;
  if(Array.isArray(value))return value.map(item=>copySerializable(item,depth+1)).filter(item=>item!==undefined);
  if(Object.getPrototypeOf(value)!==Object.prototype)return undefined;
  const result={};
  for(const [key,item] of Object.entries(value)){
    if(EXCLUDED_KEYS.has(key))continue;
    const copy=copySerializable(item,depth+1);if(copy!==undefined)result[key]=copy;
  }
  return result;
}

function serializeEntity(entity){
  const properties={};
  for(const [key,value] of Object.entries(entity)){
    if(EXCLUDED_KEYS.has(key))continue;
    const copy=copySerializable(value);if(copy!==undefined)properties[key]=copy;
  }
  return {type:entity.type,x:entity.x,y:entity.y,properties};
}

export class DataCenterSaveSystem {
  constructor({storage=storageDefault(),key=STORAGE_KEY}={}){this.storage=storage;this.key=key;}
  load(){
    try{
      const raw=this.storage?this.storage.getItem(this.key):memoryStorage.get(this.key);
      if(!raw)return null;
      const value=JSON.parse(raw);return value?.version===1?value:null;
    }catch{return null;}
  }
  save(value){
    try{
      const raw=JSON.stringify(value);
      if(this.storage)this.storage.setItem(this.key,raw);else memoryStorage.set(this.key,raw);
      return true;
    }catch{return false;}
  }
  clear(){
    try{if(this.storage)this.storage.removeItem(this.key);else memoryStorage.delete(this.key);return true;}catch{return false;}
  }
  capture(world,state,build){
    return {version:1,state:copySerializable(state),world:{materials:Array.from(world.material),energy:Array.from(world.energy),
      entities:world.entities.map(serializeEntity),utilities:world.allUtilities().map(serializeEntity)},build:{budget:build.budget,
      inventory:Object.fromEntries(Object.entries(build.inventory).map(([key,value])=>[key,Number.isFinite(value)?value:null])),
      placedEntities:world.entities.flatMap(entity=>{const item=build.placedEntities.get(entity.id);return item?[{x:entity.x,y:entity.y,type:entity.type,...item}]:[];}),
      placedMaterials:Array.from(build.placedMaterials,([index,item])=>({index,...item}))}};
  }
  restoreWorld(world,snapshot){
    if(!snapshot?.world)return false;
    world.material.set(snapshot.world.materials);world.energy.set(snapshot.world.energy);
    world.entities.length=0;world.utilityLayer.clear();
    for(const definition of snapshot.world.entities||[]){
      const entity=createLevelEntity({type:definition.type,x:definition.x,y:definition.y,...definition.properties});
      if(!entity)continue;Object.assign(entity,definition.properties||{});world.addEntity(entity);
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
      :Object.fromEntries(Object.entries(snapshot.build.inventory||{}).map(([key,value])=>[key,value===null?Infinity:value]));
    build.initialInventory={...build.inventory};
    build.placedEntities.clear();
    for(const item of snapshot.build.placedEntities||[]){
      const entity=build.world.entities.find(candidate=>candidate.x===item.x&&candidate.y===item.y&&candidate.type===item.type);
      if(entity)build.placedEntities.set(entity.id,{tool:item.tool,cost:item.cost});
    }
    build.placedMaterials=new Map((snapshot.build.placedMaterials||[]).map(({index,tool,cost})=>[index,{tool,cost}]));
    return true;
  }
}
