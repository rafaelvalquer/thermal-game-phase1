// Estimated reach of a fan jet (or an exhaust intake) for the build preview.
// It is a geometric hint, not a physics prediction: the jet widens with
// distance, weakens linearly and stops at the first solid tile on its axis.
export const AIR_REACH={fan:{range:8,spread:.3},exhaust:{range:5,spread:.4},supplyVent:{range:9,spread:.3}};

export function airReachCells(world,{x,y,direction},{range=8,spread=.3,reverse=false}={}){
  const d=reverse?{x:-direction.x,y:-direction.y}:direction,cells=[],hits=new Map(),seen=new Set();
  let blockedAt=null,length=0;
  for(let step=1;step<=range;step++){
    const cx=x+d.x*step,cy=y+d.y*step;
    if(!world.inBounds(cx,cy)||!world.isAir(cx,cy)){blockedAt=world.inBounds(cx,cy)?{x:cx,y:cy}:null;break;}
    length=step;
    const half=Math.floor(step*spread),strength=1-(step-1)/range;
    for(let offset=-half;offset<=half;offset++){
      const px=cx+d.y*offset,py=cy+d.x*offset,key=px+','+py;
      if(seen.has(key)||!world.inBounds(px,py)||!world.isAir(px,py))continue;
      seen.add(key);cells.push({x:px,y:py,strength:strength*(offset?.65:1)});
      const entity=world.entityAt?.(px,py);
      if(entity?.isHeatMachine&&!hits.has(entity.id))hits.set(entity.id,entity);
    }
  }
  return {cells,hits:[...hits.values()],blockedAt,length,direction:d};
}

export function previewAirReach(world,tool,origin){
  const config=AIR_REACH[tool];if(!config)return null;
  return airReachCells(world,origin,{...config,reverse:tool==='exhaust'});
}
