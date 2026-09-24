const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class HeatHazeSourceDetector {
  constructor({
    threshold=45,
    maxRegions=24,
    thermalSampleStep=2,
  }={}){
    this.threshold=threshold;
    this.maxRegions=maxRegions;
    this.thermalSampleStep=thermalSampleStep;
  }

  entityTemperature(e){
    if(e.isHeatMachine)return e.temperature;
    if(e.type==='radiator')return e.waterTemperature;
    if(e.type==='coolingUnit'&&e.indoor&&e.heatRejected>0)return this.localAirTemperature(e.world,e)+Math.min(80,e.heatRejected/450);
    return null;
  }

  localAirTemperature(world,e){
    let sum=0,count=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const x=e.x+dx,y=e.y+dy;
      if(!world.inBounds(x,y)||!world.isAir(x,y))continue;
      sum+=world.temperatureAt(x,y);count++;
    }
    return count?sum/count:world.environment.temperature;
  }

  airflowDirection(world,x,y){
    const cx=Math.max(0,Math.min(world.width-1,Math.floor(x)));
    const cy=Math.max(0,Math.min(world.height-1,Math.floor(y)));
    const i=world.index(cx,cy),vx=world.airX[i]||0,vy=world.airY[i]||0;
    const speed=Math.hypot(vx,vy);
    const influence=clamp(speed/4,0,1);
    const hx=vx*.22*influence,hy=-1+vy*.18*influence;
    const mag=Math.hypot(hx,hy)||1;
    return {x:hx/mag,y:hy/mag,speed};
  }

  entityRadius(e){
    if(e.type==='furnace')return {x:2.2,y:2.8};
    if(e.type==='radiator')return {x:1.15,y:1.35};
    return {x:1.45,y:1.95};
  }

  visible(region,bounds){
    if(!bounds)return true;
    return !(region.x+region.radiusX<bounds.x1||region.x-region.radiusX>bounds.x2||region.y+region.radiusY<bounds.y1||region.y-region.radiusY>bounds.y2);
  }

  detectEntities(world,bounds,regions){
    for(const e of world.entities){
      const temperature=this.entityTemperature(e);
      if(temperature==null||temperature<this.threshold)continue;
      const air=this.localAirTemperature(world,e),delta=temperature-air;
      if(delta<=2)continue;
      const radius=this.entityRadius(e);
      const region={
        id:'entity:'+e.id,
        kind:e.type,
        x:e.x+.5,
        y:e.y+.45,
        radiusX:radius.x,
        radiusY:radius.y,
        temperature,
        deltaT:delta,
        intensity:clamp(delta/60,0,1),
        direction:this.airflowDirection(world,e.x+.5,e.y+.5),
      };
      if(this.visible(region,bounds))regions.push(region);
    }
  }

  detectHotAir(world,bounds,regions){
    const step=this.thermalSampleStep;
    for(let y=0;y<world.height;y+=step){
      for(let x=0;x<world.width;x+=step){
        let sum=0,count=0;
        for(let dy=0;dy<step;dy++)for(let dx=0;dx<step;dx++){
          const tx=x+dx,ty=y+dy;
          if(!world.inBounds(tx,ty)||!world.isAir(tx,ty))continue;
          sum+=world.temperatureAt(tx,ty);count++;
        }
        if(!count)continue;
        const temp=sum/count;
        if(temp<this.threshold)continue;
        const delta=temp-world.environment.temperature;
        if(delta<=4)continue;
        const region={
          id:'air:'+x+':'+y,
          kind:'hot-air',
          x:x+Math.min(step,world.width-x)*.5,
          y:y+Math.min(step,world.height-y)*.5,
          radiusX:Math.max(1.1,step*.85),
          radiusY:Math.max(1.1,step*.95),
          temperature:temp,
          deltaT:delta,
          intensity:clamp(delta/60,0,.8),
          direction:this.airflowDirection(world,x+.5,y+.5),
        };
        if(this.visible(region,bounds))regions.push(region);
      }
    }
  }

  detect(world,bounds=null,maxRegions=this.maxRegions){
    const regions=[];
    this.detectEntities(world,bounds,regions);
    this.detectHotAir(world,bounds,regions);
    regions.sort((a,b)=>b.intensity-a.intensity||b.temperature-a.temperature);
    return regions.slice(0,maxRegions);
  }
}
