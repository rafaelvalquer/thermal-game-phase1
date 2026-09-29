import { thermalGameplayCss } from './VisualTheme.js';
import { ViewportCulling } from './ViewportCulling.js';

export class HeatmapRenderer {
  draw(ctx,world,tile,bounds=null){
    const viewport=ViewportCulling.fromBounds(bounds,tile,1).tileBounds(world);
    ctx.save();
    for(let y=viewport.minY;y<viewport.maxY;y++)for(let x=viewport.minX;x<viewport.maxX;x++){
      const i=world.index(x,y),t=world.temperatureAtIndex(i);
      ctx.fillStyle=thermalGameplayCss(t,.88);
      ctx.fillRect(x*tile,y*tile,tile+.35,tile+.35);
      if(t>=50){
        const critical=t>=80,active=t>=60;
        const pulse=critical?.45+.35*Math.sin(performance.now()/190+i*.17):active?.24+.12*Math.sin(performance.now()/420+i*.17):.14;
        ctx.strokeStyle=thermalGameplayCss(t,pulse);
        ctx.lineWidth=Math.max(.8,tile*.08);
        ctx.strokeRect(x*tile+1,y*tile+1,tile-2,tile-2);
      }
    }
    ctx.restore();
  }
}
