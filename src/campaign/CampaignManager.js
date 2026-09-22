import { LEVELS } from './levels/index.js';
import { UnlockSystem } from './UnlockSystem.js';

const STORAGE_KEY='thermal-lab-campaign-v1';

class MemoryStorage {
  constructor(){this.data=new Map();}
  getItem(k){return this.data.has(k)?this.data.get(k):null;}
  setItem(k,v){this.data.set(k,String(v));}
  removeItem(k){this.data.delete(k);}
}

const storageDefault=()=>{
  try{return globalThis.localStorage||new MemoryStorage();}
  catch{return new MemoryStorage();}
};

export class CampaignManager {
  constructor({storage=storageDefault()}={}){
    this.storage=storage;this.levels=LEVELS;this.unlocks=new UnlockSystem();this.state=this.load();
  }
  defaultState(){return {unlockedLevel:1,completedLevels:[],bestResults:{}};}
  load(){
    try{const raw=this.storage.getItem(STORAGE_KEY);if(!raw)return this.defaultState();return {...this.defaultState(),...JSON.parse(raw)};}
    catch{return this.defaultState();}
  }
  save(){try{this.storage.setItem(STORAGE_KEY,JSON.stringify(this.state));}catch{}}
  getLevel(idOrNumber){return this.levels.find(l=>l.id===idOrNumber||l.number===Number(idOrNumber))||this.levels[0];}
  isUnlocked(level){return this.unlocks.canPlay(level,this.state);}
  isCompleted(level){return this.state.completedLevels.includes(level.id);}
  completeLevel(level,result={}){
    this.unlocks.onComplete(level,this.state,this.levels.length);
    const prev=this.state.bestResults[level.id]||{};
    const min=(a,b)=>a==null?b:Math.min(a,b);
    this.state.bestResults[level.id]={
      completed:true,
      bestCost:min(prev.bestCost,result.cost),
      lowestPower:min(prev.lowestPower,result.maxPower),
      maxTemperature:min(prev.maxTemperature,result.maxTemperature),
      completionTime:min(prev.completionTime,result.completionTime),
      lastResult:result,
    };
    this.save();return this.state.bestResults[level.id];
  }
  resetProgress(){this.state=this.defaultState();this.save();}
}
