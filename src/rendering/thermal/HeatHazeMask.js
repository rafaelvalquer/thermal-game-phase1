import { HEAT_HAZE_MODE_FACTOR } from '../VisualSettings.js';

export class HeatHazeMask {
  modeFactor(mode){return HEAT_HAZE_MODE_FACTOR[mode]??1;}

  effectiveIntensity(region,mode){
    return Math.max(0,Math.min(1,region.intensity*this.modeFactor(mode)));
  }

  ellipse(ctx,cx,cy,rx,ry){
    ctx.beginPath();
    ctx.ellipse(cx,cy,Math.max(1,rx),Math.max(1,ry),0,0,Math.PI*2);
  }
}
