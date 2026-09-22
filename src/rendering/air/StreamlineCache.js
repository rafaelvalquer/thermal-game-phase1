import { StreamlineGenerator } from './StreamlineGenerator.js';
import { StreamlineSeeder } from './StreamlineSeeder.js';

const now=()=>globalThis.performance?.now?.()??Date.now();

export class StreamlineCache {
  constructor({
    refreshMs=250,
    signatureThreshold=.035,
    generator=new StreamlineGenerator(),
    seeder=new StreamlineSeeder(),
  }={}){
    this.refreshMs=refreshMs;
    this.signatureThreshold=signatureThreshold;
    this.generator=generator;
    this.seeder=seeder;
    this.lines=[];
    this.lastTime=-Infinity;
    this.lastSignature=null;
    this.lastTopology=-1;
    this.generationMs=0;
    this.pointCount=0;
  }

  signature(world){
    let sum=0,count=0;
    const stride=Math.max(1,Math.floor(world.size/96));
    for(let i=0;i<world.size;i+=stride){
      sum+=Math.abs(world.airX[i])+Math.abs(world.airY[i]);count++;
    }
    return count?sum/count:0;
  }

  shouldRefresh(world,timeMs){
    if(!this.lines.length)return true;
    if((world.airTopologyVersion??0)!==this.lastTopology)return true;
    if(timeMs-this.lastTime<this.refreshMs)return false;
    const sig=this.signature(world);
    const base=Math.max(.08,Math.abs(this.lastSignature??0));
    return Math.abs(sig-(this.lastSignature??sig))/base>this.signatureThreshold||timeMs-this.lastTime>this.refreshMs*4;
  }

  rebuild(world,density=1,timeMs=now()){
    const started=now(),seeds=this.seeder.generate(world,density),lines=[];
    for(const seed of seeds){
      const line=this.generator.generate(world,seed);
      if(line)lines.push(line);
    }
    this.lines=lines;
    this.pointCount=lines.reduce((n,l)=>n+l.points.length,0);
    this.lastSignature=this.signature(world);
    this.lastTopology=world.airTopologyVersion??0;
    this.lastTime=timeMs;
    this.generationMs=now()-started;
    return lines;
  }

  get(world,density=1,timeMs=now()){
    if(this.shouldRefresh(world,timeMs))this.rebuild(world,density,timeMs);
    return this.lines;
  }

  diagnostics(timeMs=now()){
    return {
      active:this.lines.length,
      points:this.pointCount,
      generationMs:this.generationMs,
      cacheAgeMs:Math.max(0,timeMs-this.lastTime),
    };
  }
}
