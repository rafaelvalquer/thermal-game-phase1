import { isPowered } from '../../simulation/PowerState.js';
export class StreamlineSeeder {
  constructor({
    gridStep=4,
    minimumSeedDistance=1.5,
    minSpeed=.05,
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

  addSeed(seeds,world,candidate,max,minimumDistance=this.minimumSeedDistance,sourceType=null){
    if(seeds.length>=max)return;
    const x=Math.floor(candidate.x),y=Math.floor(candidate.y);
    if(!world.inBounds(x,y)||!world.isAir(x,y))return;
    if(this.speedAt(world,x,y)<this.minSpeed)return;
    if(this.farEnough(seeds,candidate,minimumDistance))seeds.push(sourceType?{...candidate,sourceType}:candidate);
  }

  addEquipmentSeed(seeds,world,candidate,max,minimumDistance=.42,sourceType='equipment'){
    if(seeds.length>=max)return;
    const x=Math.floor(candidate.x),y=Math.floor(candidate.y);
    if(!world.inBounds(x,y)||!world.isAir(x,y)||this.speedAt(world,x,y)<this.minSpeed)return;
    if(this.farEnough(seeds,candidate,minimumDistance))seeds.push({...candidate,priority:2,sourceType});
  }

  fromEquipment(world,seeds,max,entities=world.entities){
    for(const e of entities){
      if(!['fan','exhaust','radiator','coolingUnit','supplyVent'].includes(e.type))continue;
      if(!isPowered(e))continue;
      if(e.type==='radiator'&&(e.waterTemperature||25)<35)continue;
      if(e.type==='coolingUnit'&&(!e.indoor||(e.heatRejected||0)<=0))continue;
      if(e.type==='supplyVent'&&(e.flowRate||0)<=0)continue;
      const d=e.direction||{x:1,y:0};
      const px=-d.y,py=d.x;
      if(e.type==='coolingUnit'||e.type==='supplyVent'){
        const sourceType=e.type==='coolingUnit'?'hot':'cold',length=e.type==='coolingUnit'?Math.max(1,e.footprintLength||1):1,offset=e.type==='coolingUnit'?length-.1:.68;
        const frontX=e.x+d.x*length,frontY=e.y+d.y*length,faceBlocked=world.inBounds(frontX,frontY)&&world.materialAt(frontX,frontY).solid;
        if(faceBlocked)continue;
        for(const lateral of [-.3,0,.3]){
          const candidate={x:e.x+.5+d.x*offset+px*lateral,y:e.y+.5+d.y*offset+py*lateral};
          const cx=Math.floor(candidate.x),cy=Math.floor(candidate.y);
          if(world.isAir(cx,cy)&&this.speedAt(world,cx,cy)>=this.minSpeed&&this.farEnough(seeds,candidate,.15))seeds.push({...candidate,priority:2,sourceType});
        }
        continue;
      }
      if(e.type==='exhaust'){
        // Seed the wide end of the capture funnel and its narrower throat.
        for(const [distance,laterals] of [[3.6,[-2.3,0,2.3]],[1.8,[-1,1]]])for(const lateral of laterals)this.addSeed(seeds,world,{
          x:e.x+.5-d.x*distance+px*lateral,
          y:e.y+.5-d.y*distance+py*lateral,
          priority:2,
        },max,.42,'exhaust');
      }
      for(const lateral of [-.5,0,.5]){
        this.addSeed(seeds,world,{
          x:e.x+.5+d.x*.62+px*lateral,
          y:e.y+.5+d.y*.62+py*lateral,
          priority:2,
        },max,.42,e.type==='exhaust'?'exhaust':e.type);
      }
    }
  }

  generate(world,density=1){
    // Give every source its first line before allocating additional outlet lines.
    const groups=[];
    for(const e of world.entities){
      const candidates=[];this.fromEquipment(world,candidates,Infinity,[e]);
      if(candidates.length)groups.push(candidates.map(seed=>({...seed,sourceId:e.id})));
    }
    const base=this.maxLines(world,density),max=Math.max(base,Math.min(512,groups.length+Math.ceil(base*.3)));
    const seeds=[],reserve=Math.ceil(max*.25),equipmentBudget=Math.min(max-reserve,Math.max(groups.length,Math.floor(max*.65)));
    for(let round=0;seeds.length<equipmentBudget;round++){
      let added=false;
      for(const group of groups){if(seeds.length>=equipmentBudget)break;if(group[round]){seeds.push(group[round]);added=true;}}
      if(!added)break;
    }
    // Sample each block's strongest cell (including boundary rows), then take
    // candidates round-robin across spatial sectors instead of exhausting the
    // budget at the top of the map. Small jets need not intersect a coarse grid.
    const step=Math.max(2,Math.round(this.gridStep/Math.max(.5,density))),regions=Array.from({length:16},()=>[]);
    for(let by=0;by<world.height;by+=step)for(let bx=0;bx<world.width;bx+=step){
      let best=null,bestSpeed=-1,bestDistance=Infinity;
      for(let y=by;y<Math.min(by+step,world.height);y++)for(let x=bx;x<Math.min(bx+step,world.width);x++){
        if(!world.isAir(x,y))continue;
        const i=world.index(x,y),speed=world.airX[i]**2+world.airY[i]**2,distance=(x-bx-step/2)**2+(y-by-step/2)**2;
        if(speed<this.minSpeed**2||speed<bestSpeed||(speed===bestSpeed&&distance>=bestDistance))continue;
        best={x:x+.5,y:y+.5,priority:1};bestSpeed=speed;bestDistance=distance;
      }
      if(best){const rx=Math.min(3,Math.floor(best.x/world.width*4)),ry=Math.min(3,Math.floor(best.y/world.height*4));regions[ry*4+rx].push(best);}
    }
    // Reorder each region deterministically so limited budgets span its extent.
    const spread=items=>{const out=[],visit=(lo,hi)=>{if(lo>hi)return;const mid=(lo+hi)>>1;out.push(items[mid]);visit(lo,mid-1);visit(mid+1,hi);};visit(0,items.length-1);return out;};
    const ordered=regions.map(spread);
    for(let round=0;seeds.length<max;round++){
      let available=false;
      for(const region of ordered){const seed=region[round];if(!seed)continue;available=true;this.addSeed(seeds,world,seed,max);}
      if(!available)break;
    }
    return seeds;
  }
}
