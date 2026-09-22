import { heatCss } from './VisualTheme.js';

export class HeatmapRenderer {
  draw(ctx,world,tile){
    ctx.save();
    for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
      const i=world.index(x,y),t=world.temperatureAtIndex(i);
      ctx.fillStyle=heatCss(t,.7);
      ctx.fillRect(x*tile,y*tile,tile+.35,tile+.35);
      if(t>=60){
        const pulse=.25+.2*Math.sin(performance.now()/260+i*.17);
        ctx.strokeStyle=heatCss(t,pulse);
        ctx.lineWidth=Math.max(.8,tile*.08);
        ctx.strokeRect(x*tile+1,y*tile+1,tile-2,tile-2);
      }
    }
    ctx.globalCompositeOperation='screen';
    ctx.fillStyle='rgba(255,255,255,.025)';
    ctx.fillRect(0,0,world.width*tile,world.height*tile);
    ctx.restore();
  }
}
