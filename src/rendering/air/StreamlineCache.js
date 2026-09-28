import { StreamlineGenerator } from './StreamlineGenerator.js';
import { StreamlineSeeder } from './StreamlineSeeder.js';
const now=()=>globalThis.performance?.now?.()??Date.now();
export class StreamlineCache {
  constructor({refreshMs=250,signatureThreshold=.035,generator=new StreamlineGenerator(),seeder=new StreamlineSeeder()}={}){
    Object.assign(this,{refreshMs,signatureThreshold,generator,seeder});
    this.lines=[];this.lastTime=-Infinity;this.lastCheckTime=-Infinity;this.lastWorld=null;this.lastTopology=-1;this.lastDensity=null;this.lastSourceSignature=null;
    this.velocityX=null;this.velocityY=null;this.generationMs=0;this.pointCount=0;this.rebuildCount=0;
  }
  sourceSignature(world){return world.entities.filter(e=>['coolingUnit','supplyVent','fan','exhaust','radiator'].includes(e.type)).map(e=>[
    e.id,e.type,e.x,e.y,e.direction?.x??1,e.direction?.y??0,e.enabled!==false,!!e.powerBlocked,e.footprintLength||1,
    e.indoor===true,(e.heatRejected||0)>0,(e.flowRate||0)>0,(e.waterTemperature||25)>=35,
  ].join(':')).join('|');}
  velocityChanged(world){
    if(this.velocityX?.length!==world.size)return true;
    // Component-wise comparison detects direction reversals and local jets that
    // a sampled average of absolute speeds used to miss entirely.
    for(let i=0;i<world.size;i++){
      if(Math.abs(world.airX[i]-this.velocityX[i])>this.signatureThreshold*Math.max(.08,Math.abs(this.velocityX[i]))||
         Math.abs(world.airY[i]-this.velocityY[i])>this.signatureThreshold*Math.max(.08,Math.abs(this.velocityY[i])))return true;
    }return false;
  }
  shouldRefresh(world,timeMs,density=1){
    if(world!==this.lastWorld||(world.airTopologyVersion??0)!==this.lastTopology||density!==this.lastDensity)return true;
    if(timeMs-this.lastCheckTime<this.refreshMs)return false;
    this.lastCheckTime=timeMs;
    return this.sourceSignature(world)!==this.lastSourceSignature||this.velocityChanged(world);
  }
  rebuild(world,density=1,timeMs=now()){
    const started=now(),seeds=this.seeder.generate(world,density),lines=[];
    for(const seed of seeds){const line=this.generator.generate(world,seed);if(line)lines.push(line);}
    this.lines=lines;this.pointCount=lines.reduce((n,l)=>n+l.points.length,0);
    if(this.velocityX?.length!==world.size){this.velocityX=new Float32Array(world.size);this.velocityY=new Float32Array(world.size);}
    this.velocityX.set(world.airX);this.velocityY.set(world.airY);
    this.lastSourceSignature=this.sourceSignature(world);this.lastTopology=world.airTopologyVersion??0;this.lastDensity=density;this.lastWorld=world;
    this.lastTime=timeMs;this.lastCheckTime=timeMs;this.generationMs=now()-started;this.rebuildCount++;return lines;
  }
  get(world,density=1,timeMs=now()){if(this.shouldRefresh(world,timeMs,density))this.rebuild(world,density,timeMs);return this.lines;}
  diagnostics(timeMs=now()){return {active:this.lines.length,points:this.pointCount,generationMs:this.generationMs,cacheAgeMs:Math.max(0,timeMs-this.lastTime),rebuilds:this.rebuildCount};}
}
