const setLine=(world,x1,y1,x2,y2,material)=>{
  if(x1===x2){const [a,b]=y1<=y2?[y1,y2]:[y2,y1];for(let y=a;y<=b;y++)world.setMaterial(x1,y,material);}
  else if(y1===y2){const [a,b]=x1<=x2?[x1,x2]:[x2,x1];for(let x=a;x<=b;x++)world.setMaterial(x,y1,material);}
};

const rect=(world,{x,y,w,h,material='concrete'})=>{
  setLine(world,x,y,x+w-1,y,material);setLine(world,x,y+h-1,x+w-1,y+h-1,material);
  setLine(world,x,y,x,y+h-1,material);setLine(world,x+w-1,y,x+w-1,y+h-1,material);
};

const fillRect=(world,{x,y,w,h,material})=>{
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(world.inBounds(xx,yy))world.setMaterial(xx,yy,material);
};

export class MapBuilder {
  static apply(world,spec){
    world.fill(spec.baseMaterial||'air',spec.initialTemperature??world.environment.temperature);
    for(const r of spec.rooms||[])rect(world,r);
    for(const l of spec.lines||[])setLine(world,l.x1,l.y1,l.x2,l.y2,l.material||'concrete');
    for(const f of spec.fills||[])fillRect(world,f);
    for(const o of spec.openings||[])fillRect(world,{...o,material:'air'});
    for(const m of spec.materials||[])fillRect(world,m);
  }
}
