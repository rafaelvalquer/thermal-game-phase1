import { thermalGameplayCss } from './VisualTheme.js';

export class HeatmapRenderer {
  draw(ctx,world,tile){
    ctx.save();
    for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
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
