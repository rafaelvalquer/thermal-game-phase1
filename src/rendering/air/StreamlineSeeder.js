export class StreamlineSeeder {
  constructor({
    gridStep=4,
    minimumSeedDistance=1.5,
    minSpeed=.08,
  }={}){
    this.gridStep=gridStep;
    this.minimumSeedDistance=minimumSeedDistance;
    this.minSpeed=minSpeed;
  }

  maxLines(world,density=1){
    const area=world.width*world.height;
    const base=area<1800?45:area<4000?85:125;
    return Math.max(12,Math.round(base*density));
  }

  farEnough(seeds,candidate,minimumDistance=this.minimumSeedDistance){
    const d2=minimumDistance*minimumDistance;
    return !seeds.some(s=>{
      const dx=s.x-candidate.x,dy=s.y-candidate.y;
      return dx*dx+dy*dy<d2;
    });
  }

  speedAt(world,x,y){
    if(!world.inBounds(x,y)||!world.isAir(x,y))return 0;
    const i=world.index(x,y);
    return Math.hypot(world.airX[i],world.airY[i]);
  }

  addSeed(seeds,world,candidate,max,minimumDistance=this.minimumSeedDistance){
    if(seeds.length>=max)return;
    const x=Math.floor(candidate.x),y=Math.floor(candidate.y);
    if(!world.inBounds(x,y)||!world.isAir(x,y))return;
    if(this.speedAt(world,x,y)<this.minSpeed)return;
    if(this.farEnough(seeds,candidate,minimumDistance))seeds.push(candidate);
  }

  addEquipmentSeed(seeds,world,candidate,max,minimumDistance=.42){
    if(seeds.length>=max)return;
    const x=Math.floor(candidate.x),y=Math.floor(candidate.y);
    if(!world.inBounds(x,y)||!world.isAir(x,y)||this.speedAt(world,x,y)<this.minSpeed)return;
    if(this.farEnough(seeds,candidate,minimumDistance))seeds.push({...candidate,priority:2});
  }

  fromEquipment(world,seeds,max){
    for(const e of world.entities){
      if(!['fan','exhaust','radiator','coolingUnit'].includes(e.type))continue;
      if(!e.enabled)continue;
      if(e.type==='radiator'&&(e.waterTemperature||25)<35)continue;
      if(e.type==='coolingUnit'&&(!e.indoor||(e.heatRejected||0)<=0))continue;
      const d=e.direction||{x:1,y:0};
      const px=-d.y,py=d.x;
      if(e.type==='coolingUnit'){
        for(const lateral of [-.3,0,.3]){
          const candidate={x:e.x+.5+d.x*.9+px*lateral,y:e.y+.5+d.y*.9+py*lateral};
          this.addEquipmentSeed(seeds,world,candidate,max,.15);
          const cx=Math.floor(candidate.x),cy=Math.floor(candidate.y),faceBlocked=d.x?world.materialAt(d.x>0?e.x+1:e.x,e.y).solid:world.materialAt(e.x,d.y>0?e.y+1:e.y).solid;
          if(!faceBlocked&&world.isAir(cx,cy)&&this.speedAt(world,cx,cy)>=this.minSpeed&&this.farEnough(seeds,candidate,.15))seeds.push({...candidate,priority:2});
        }
        continue;
      }
      if(e.type==='exhaust'){
        // Seed the inlet so streamlines reveal capture, not just discharge.
        for(const lateral of [-1.2,0,1.2])this.addSeed(seeds,world,{
          x:e.x+.5-d.x*1.6+px*lateral,
          y:e.y+.5-d.y*1.6+py*lateral,
          priority:2,
        },max,.42);
      }
      for(const lateral of [-.5,0,.5]){
        this.addSeed(seeds,world,{
          x:e.x+.5+d.x*.62+px*lateral,
          y:e.y+.5+d.y*.62+py*lateral,
          priority:2,
        },max,.42);
      }
    }
  }

  generate(world,density=1){
    const max=this.maxLines(world,density),equipmentSeeds=[];
    this.fromEquipment(world,equipmentSeeds,max);
    const activeCondenser=world.entities.some(e=>e.type==='coolingUnit'&&e.enabled&&e.indoor&&(e.heatRejected||0)>0);
    if(activeCondenser)return equipmentSeeds;
    const seeds=equipmentSeeds.slice();

    const step=Math.max(2,Math.round(this.gridStep/Math.max(.5,density)));
    for(let y=1;y<world.height-1&&seeds.length<max;y+=step){
      for(let x=1;x<world.width-1&&seeds.length<max;x+=step){
        this.addSeed(seeds,world,{x:x+.5,y:y+.5,priority:1},max);
      }
    }
    return seeds;
  }
}
