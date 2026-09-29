import { thermalGameplayCss } from './VisualTheme.js';
import { ViewportCulling } from './ViewportCulling.js';

export class HeatmapRenderer {
  draw(ctx,world,tile,bounds=null,zoom=1,time=0){
    const viewport=ViewportCulling.fromBounds(bounds,tile,1).tileBounds(world);
    const scale=zoom>=.8?1:zoom>=.5?2:4;
    ctx.save();
    for(let y=viewport.minY;y<viewport.maxY;y+=scale)for(let x=viewport.minX;x<viewport.maxX;x+=scale){
      let temperature=-Infinity;
      for(let by=y;by<Math.min(viewport.maxY,y+scale);by++)for(let bx=x;bx<Math.min(viewport.maxX,x+scale);bx++)temperature=Math.max(temperature,world.temperatureAtIndex(world.index(bx,by)));
      const t=temperature;
      ctx.fillStyle=thermalGameplayCss(t,.88);
      ctx.fillRect(x*tile,y*tile,scale*tile+.35,scale*tile+.35);
      if(t>=50){
        const critical=t>=80,active=t>=60;
        const pulse=critical?.45+.35*Math.sin(time*1000/190+x*.17+y*.11):active?.24+.12*Math.sin(time*1000/420+x*.17+y*.11):.14;
        ctx.strokeStyle=thermalGameplayCss(t,pulse);
        ctx.lineWidth=Math.max(.8,tile*.08);
        ctx.strokeRect(x*tile+1,y*tile+1,scale*tile-2,scale*tile-2);
      }
    }
    ctx.restore();
  }
}
