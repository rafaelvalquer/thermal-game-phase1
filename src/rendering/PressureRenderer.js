export class PressureRenderer {
  draw(ctx,world,tile){
    const pressure=world.airPressure;
    if(!pressure)return;
    let maxAbs=5;
    for(let i=0;i<pressure.length;i++)maxAbs=Math.max(maxAbs,Math.abs(pressure[i]));
    maxAbs=Math.min(180,maxAbs);

    ctx.save();
    for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
      if(!world.isAir(x,y))continue;
      const p=pressure[world.index(x,y)];
      const n=Math.max(-1,Math.min(1,p/maxAbs));
      const alpha=.08+Math.abs(n)*.46;
      if(n>0)ctx.fillStyle='rgba(239,68,68,'+alpha+')';
      else if(n<0)ctx.fillStyle='rgba(37,99,235,'+alpha+')';
      else ctx.fillStyle='rgba(148,163,184,.05)';
      ctx.fillRect(x*tile,y*tile,tile,tile);
    }
    ctx.restore();
  }
}
