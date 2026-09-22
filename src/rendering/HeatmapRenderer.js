import { rgbHeat } from '../utils/MathUtils.js';
export class HeatmapRenderer {
  draw(ctx,world,tile){for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){const i=world.index(x,y);const t=world.temperatureAtIndex(i);const [r,g,b]=rgbHeat(t);ctx.fillStyle=`rgba(${r},${g},${b},.72)`;ctx.fillRect(x*tile,y*tile,tile,tile);}}
}
