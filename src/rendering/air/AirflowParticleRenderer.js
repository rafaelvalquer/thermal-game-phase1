import { StreamlineGenerator } from './StreamlineGenerator.js';
import { clamp } from '../../utils/MathUtils.js';

export class AirflowParticleRenderer {
  constructor({count=150}={}){
    this.count=count;
    this.particles=[];
    this.generator=new StreamlineGenerator();
    this.lastTime=null;
    this.worldKey='';
    this.seed=1337;
  }

  random(){
    this.seed=(this.seed*1664525+1013904223)>>>0;
    return this.seed/4294967296;
  }

  resetParticle(p,world){
    for(let tries=0;tries<20;tries++){
      const x=this.random()*world.width,y=this.random()*world.height;
      if(this.generator.isValidPosition(world,x,y)){
        const v=this.generator.sampleVelocity(world,x,y);
        if(v.speed>.06){p.x=x;p.y=y;p.life=.7+this.random()*2.8;return;}
      }
    }
    p.x=.5;p.y=.5;p.life=0;
  }

  ensure(world){
    const key=world.width+'x'+world.height;
    if(key===this.worldKey&&this.particles.length===this.count)return;
    this.worldKey=key;this.particles=[];this.seed=1337;
    for(let i=0;i<this.count;i++){const p={x:0,y:0,life:0};this.resetParticle(p,world);this.particles.push(p);}
  }

  draw(ctx,world,tile,time,zoom=1){
    const zoomBucket=Math.round(zoom*4)/4;
    this.count=Math.round(clamp(150*zoomBucket,90,210));
    this.ensure(world);
    const dt=this.lastTime==null?0:Math.min(.05,Math.max(0,time-this.lastTime));
    this.lastTime=time;
    ctx.save();ctx.lineCap='round';

    for(const p of this.particles){
      p.life-=dt;
      const v=this.generator.sampleVelocity(world,p.x,p.y);
      if(p.life<=0||v.speed<.05||!this.generator.isValidPosition(world,p.x,p.y)){this.resetParticle(p,world);continue;}
      const scale=.42;
      const ox=p.x,oy=p.y;
      p.x+=v.x*dt*scale;p.y+=v.y*dt*scale;
      if(!this.generator.isValidPosition(world,p.x,p.y)){this.resetParticle(p,world);continue;}
      const alpha=Math.min(.8,.18+v.speed*.1);
      ctx.strokeStyle='rgba(186,230,253,'+alpha+')';
      ctx.lineWidth=Math.max(.8,tile*.055);
      ctx.beginPath();ctx.moveTo(ox*tile,oy*tile);ctx.lineTo(p.x*tile,p.y*tile);ctx.stroke();
    }
    ctx.restore();
  }
}
