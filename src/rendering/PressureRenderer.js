import { ViewportCulling } from './ViewportCulling.js';

export class PressureRenderer {
  draw(ctx,world,tile,bounds=null){
    const pressure=world.airPressure;
    if(!pressure)return;
    const viewport=ViewportCulling.fromBounds(bounds,tile,1).tileBounds(world),diagnostics=world.airDiagnostics||{};
    let maxAbs=Math.max(5,Math.abs(diagnostics.maxPressure||0),Math.abs(diagnostics.minPressure||0));
    maxAbs=Math.min(180,maxAbs);

    ctx.save();
    for(let y=viewport.minY;y<viewport.maxY;y++)for(let x=viewport.minX;x<viewport.maxX;x++){
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
