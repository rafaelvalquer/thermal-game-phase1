import { HeatHazeSourceDetector } from './HeatHazeSourceDetector.js';
import { HeatHazeMask } from './HeatHazeMask.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class HeatHazeRenderer {
  constructor({quality='high',maxRegions=24}={}){
    this.quality=quality;
    this.maxRegions=maxRegions;
    this.detector=new HeatHazeSourceDetector({maxRegions});
    this.mask=new HeatHazeMask();
    this.lastDiagnostics={sources:0,regions:0,renderMs:0};
  }

  viewportBounds(camera,width,height,tile){
    const a=camera.screenToWorld(0,0),b=camera.screenToWorld(width,height);
    return {
      x1:a.x/tile-3,
      y1:a.y/tile-3,
      x2:b.x/tile+3,
      y2:b.y/tile+3,
    };
  }

  sliceHeight(){
    return this.quality==='high'?4:this.quality==='medium'?7:10;
  }

  maxAmplitude(intensity){
    if(this.quality==='low')return .8+intensity*1.4;
    if(this.quality==='medium')return 1+intensity*2.8;
    return 1+intensity*4.2;
  }

  render(ctx,sourceCanvas,world,camera,tile,mode,time,width,height,dpr=1){
    const start=globalThis.performance?.now?.()??Date.now();
    ctx.drawImage(sourceCanvas,0,0,sourceCanvas.width,sourceCanvas.height,0,0,width,height);
    if(!sourceCanvas||!world)return;

    const bounds=this.viewportBounds(camera,width,height,tile);
    const regions=this.detector.detect(world,bounds,this.maxRegions);
    const sliceH=this.sliceHeight();

    for(const region of regions){
      const intensity=this.mask.effectiveIntensity(region,mode);
      if(intensity<.025)continue;

      const centerWorldX=region.x*tile,centerWorldY=region.y*tile;
      const screen=camera.worldToScreen(centerWorldX,centerWorldY);
      const rx=region.radiusX*tile*camera.zoom,ry=region.radiusY*tile*camera.zoom;
      if(screen.x+rx<0||screen.y+ry<0||screen.x-rx>width||screen.y-ry>height)continue;

      const amp=this.maxAmplitude(intensity);
      const dir=region.direction||{x:0,y:-1};
      const phaseBase=time*(1.45+intensity*.9)+region.x*.17+region.y*.11;

      ctx.save();
      this.mask.ellipse(ctx,screen.x,screen.y,rx,ry);
      ctx.clip();
      ctx.globalAlpha=clamp(.18+intensity*.56,.18,.72);

      const left=screen.x-rx,right=screen.x+rx,top=screen.y-ry,bottom=screen.y+ry;
      for(let y=top;y<bottom;y+=sliceH){
        const h=Math.min(sliceH,bottom-y);
        const wave=Math.sin(phaseBase-y*.055)*amp;
        const wobble=Math.cos(phaseBase*.83+y*.041)*amp*.22;
        const driftX=dir.x*amp*(.75+intensity*.35);
        const driftY=dir.y*amp*.35;
        const dx=wave+driftX,dy=wobble+driftY;

        const sx=Math.max(0,left),sy=Math.max(0,y);
        const ex=Math.min(width,right),ey=Math.min(height,y+h);
        const sw=ex-sx,sh=ey-sy;
        if(sw<=0||sh<=0)continue;

        ctx.drawImage(
          sourceCanvas,
          sx*dpr,sy*dpr,sw*dpr,sh*dpr,
          sx+dx,sy+dy,sw,sh
        );
      }
      ctx.restore();
    }

    this.lastDiagnostics={
      sources:regions.length,
      regions:regions.length,
      renderMs:(globalThis.performance?.now?.()??Date.now())-start,
    };
  }

  diagnostics(){return this.lastDiagnostics;}
}
