const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class StreamlineGenerator {
  constructor({
    minSpeed=.05,
    step=.28,
    maxPoints=120,
    loopDistance=.55,
    loopLookback=14,
  }={}){
    this.minSpeed=minSpeed;
    this.step=step;
    this.maxPoints=maxPoints;
    this.loopDistance=loopDistance;
    this.loopLookback=loopLookback;
  }

  sampleVelocity(world,x,y){
    const fx=x-.5,fy=y-.5;
    const x0=clamp(Math.floor(fx),0,world.width-1),y0=clamp(Math.floor(fy),0,world.height-1);
    const x1=clamp(x0+1,0,world.width-1),y1=clamp(y0+1,0,world.height-1);
    const tx=clamp(fx-x0,0,1),ty=clamp(fy-y0,0,1);
    const sample=(field)=>{
      const a=field[world.index(x0,y0)]*(1-tx)+field[world.index(x1,y0)]*tx;
      const b=field[world.index(x0,y1)]*(1-tx)+field[world.index(x1,y1)]*tx;
      return a*(1-ty)+b*ty;
    };
    const vx=sample(world.airX),vy=sample(world.airY);
    return {x:vx,y:vy,speed:Math.hypot(vx,vy)};
  }

  isValidPosition(world,x,y){
    const cx=Math.floor(x),cy=Math.floor(y);
    return x>=0&&y>=0&&x<world.width&&y<world.height&&world.inBounds(cx,cy)&&world.isAir(cx,cy);
  }

  rk2Step(world,p,direction){
    const v1=this.sampleVelocity(world,p.x,p.y);
    if(v1.speed<this.minSpeed)return null;
    const n1x=v1.x/v1.speed*direction,n1y=v1.y/v1.speed*direction;
    const mid={x:p.x+n1x*this.step*.5,y:p.y+n1y*this.step*.5};
    if(!this.isValidPosition(world,mid.x,mid.y))return null;
    const v2=this.sampleVelocity(world,mid.x,mid.y);
    if(v2.speed<this.minSpeed)return null;
    const nx=v2.x/v2.speed*direction,ny=v2.y/v2.speed*direction;
    const next={x:p.x+nx*this.step,y:p.y+ny*this.step,speed:v2.speed};
    if(!this.isValidPosition(world,next.x,next.y))return null;
    return next;
  }

  loopIndex(points,next){
    const limit=points.length-this.loopLookback;
    if(limit<=0)return -1;
    const d2=this.loopDistance*this.loopDistance;
    for(let i=0;i<limit;i++){
      const p=points[i],dx=p.x-next.x,dy=p.y-next.y;
      if(dx*dx+dy*dy<=d2)return i;
    }
    return -1;
  }

  integrate(world,seed,direction){
    if(!this.isValidPosition(world,seed.x,seed.y))return {points:[],loop:false,loopIndex:-1};
    const firstVelocity=this.sampleVelocity(world,seed.x,seed.y);
    if(firstVelocity.speed<this.minSpeed)return {points:[],loop:false,loopIndex:-1};

    const points=[{x:seed.x,y:seed.y,speed:firstVelocity.speed}];
    let loop=false,loopIndex=-1;

    for(let i=1;i<this.maxPoints;i++){
      const next=this.rk2Step(world,points[points.length-1],direction);
      if(!next)break;
      const hit=this.loopIndex(points,next);
      if(hit>=0){
        points.push({...points[hit]});
        loop=true;loopIndex=hit;
        break;
      }
      points.push(next);
    }
    return {points,loop,loopIndex};
  }

  integrateForward(world,seed){return this.integrate(world,seed,1);}
  integrateBackward(world,seed){return this.integrate(world,seed,-1);}

  generate(world,seed){
    const backward=this.integrateBackward(world,seed);
    const forward=this.integrateForward(world,seed);
    if(!forward.points.length&&!backward.points.length)return null;

    const back=backward.points.slice(1).reverse();
    const points=back.concat(forward.points);
    if(points.length<3)return null;
    let speedSum=0,maxSpeed=0;
    for(const p of points){speedSum+=p.speed||0;maxSpeed=Math.max(maxSpeed,p.speed||0);}
    return {
      seed,
      points,
      loop:forward.loop||backward.loop,
      averageSpeed:speedSum/points.length,
      maxSpeed,
    };
  }
}
