import { ViewportCulling } from '../ViewportCulling.js';

const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const COOLING_ENDPOINTS=new Set(['supplyVent','coolingUnit']);
export class CoolingDuctRenderer {
  constructor({canvasFactory=defaultCanvasFactory}={}){this.linkCache=new WeakMap();this.canvasFactory=canvasFactory;this.layerCache=new Map();}
  draw(ctx,world,tile,mode='normal',zoom=1,bounds=null){
    this.stats={renderedDucts:0};
    const viewport=ViewportCulling.fromBounds(bounds,tile,2);
    const ducts=world.utilitySetByType?.('duct')||world.allUtilities().filter(item=>item.type==='duct');
    if((mode==='normal'||mode==='thermal')&&this.drawCachedLayer(ctx,world,ducts,tile,mode,zoom,viewport)){
      for(const duct of ducts)if(viewport.contains(duct.x,duct.y))this.stats.renderedDucts++;
      return;
    }
    this.drawDucts(ctx,world,ducts,tile,mode,zoom,viewport);
  }
  drawCachedLayer(ctx,world,ducts,tile,mode,zoom,viewport){
    const ratio=Math.max(1,Math.min(4,Math.ceil(Math.max(.25,zoom)*(globalThis.devicePixelRatio||1))));
    const key=`${mode}:${world.utilityTopologyVersion??0}:${world.width}x${world.height}:${tile}:${ratio}`,width=world.width*tile,height=world.height*tile;
    let entry=this.layerCache.get(key);
    if(!entry){
      const canvas=this.canvasFactory(width*ratio,height*ratio);if(!canvas)return false;
      canvas.width=width*ratio;canvas.height=height*ratio;
      const layer=canvas.getContext?.('2d');if(!layer)return false;
      layer.setTransform?.(ratio,0,0,ratio,0,0);layer.imageSmoothingEnabled=false;
      const previousRendered=this.stats.renderedDucts;
      this.drawDucts(layer,world,ducts,tile,mode,zoom,new ViewportCulling({minX:0,minY:0,maxX:world.width,maxY:world.height,margin:0}));
      this.stats.renderedDucts=previousRendered;
      entry={canvas,width,height,ratio};this.layerCache.set(key,entry);
      for(const existingKey of this.layerCache.keys())if(existingKey!==key&&this.layerCache.size>2)this.layerCache.delete(existingKey);
    }
    const tileBounds=viewport.tileBounds(world),sx=tileBounds.minX*tile*entry.ratio,sy=tileBounds.minY*tile*entry.ratio,sw=(tileBounds.maxX-tileBounds.minX)*tile*entry.ratio,sh=(tileBounds.maxY-tileBounds.minY)*tile*entry.ratio;
    if(sw<=0||sh<=0)return true;
    ctx.imageSmoothingEnabled=false;ctx.drawImage(entry.canvas,sx,sy,sw,sh,tileBounds.minX*tile,tileBounds.minY*tile,sw/entry.ratio,sh/entry.ratio);
    return true;
  }
  drawDucts(ctx,world,ducts,tile,mode,zoom,viewport){
    for(const duct of ducts){
      if(!viewport.contains(duct.x,duct.y))continue;
      this.stats.renderedDucts++;
      const cx=(duct.x+.5)*tile,cy=(duct.y+.5)*tile,links=this.linksFor(duct,world);
      const color=mode==='normal'?'#819594':mode==='thermal'?'#34495e':duct.networkStatus==='READY'?'#38bdf8':'#8292a8',width=tile*(mode==='normal'?.34:.22);ctx.save();ctx.lineCap='square';ctx.lineJoin='miter';
      const stroke=()=>{ctx.beginPath();for(const [dx,dy] of links){ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.55,cy+dy*tile*.55);}if(!links.length){ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);}ctx.stroke();};
      ctx.strokeStyle='rgba(2,6,23,.94)';ctx.lineWidth=width+tile*.13;stroke();ctx.strokeStyle=color;ctx.lineWidth=width;if(mode==='cooling'&&duct.networkStatus!=='READY')ctx.setLineDash([tile*.13,tile*.09]);stroke();ctx.setLineDash([]);
      if(mode==='normal'){
        ctx.strokeStyle='#a7b9b3';ctx.lineWidth=tile*.05;stroke();
        ctx.strokeStyle='#455b63';ctx.lineWidth=tile*.06;ctx.beginPath();
        for(const [dx,dy] of links){const x=cx+dx*tile*.35,y=cy+dy*tile*.35;ctx.moveTo(x-dy*width*.65,y-dx*width*.65);ctx.lineTo(x+dy*width*.65,y+dx*width*.65);}ctx.stroke();
      }
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(cx,cy,Math.max(1,width*.42),0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }
  drawOutletConnections(ctx,world,tile,time=0,zoom=1,bounds=null){
    const viewport=ViewportCulling.fromBounds(bounds,tile,2),vents=world.entitiesByType?.('supplyVent')||[];
    for(const vent of vents){
      if(!viewport.contains(vent.x,vent.y))continue;
      for(const [dx,dy] of DIRS){
        const duct=world.utilityAt(vent.x+dx,vent.y+dy,'duct');if(!duct)continue;
        const cx=(vent.x+.5)*tile,cy=(vent.y+.5)*tile,px=cx+dx*tile*.34,py=cy+dy*tile*.34;
        const linked=Boolean(duct.networkId&&vent.networkId&&(duct.networkId===vent.networkId||String(vent.networkId).split(',').includes(duct.networkId)));
        const flowing=linked&&vent.networkStatus==='READY'&&vent.flowRate>.001;
        const color=flowing?'#67e8f9':linked?'#94a3b8':'#64748b',radius=tile*.105;
        ctx.save();ctx.lineCap='round';ctx.globalAlpha=.98;
        // Draw a short socket over the vent sprite, on the side facing its duct.
        ctx.strokeStyle='rgba(2,6,23,.96)';ctx.lineWidth=tile*.25;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(px,py);ctx.stroke();
        ctx.strokeStyle=flowing?'#155e75':'#334155';ctx.lineWidth=tile*.16;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(px,py);ctx.stroke();
        ctx.fillStyle='rgba(2,6,23,.98)';ctx.beginPath();ctx.arc(px,py,radius*1.35,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,tile*.045);ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle=color;ctx.beginPath();ctx.arc(px,py,radius*.34,0,Math.PI*2);ctx.fill();
        if(flowing){
          const phase=(time*(.7+Math.min(1.8,vent.flowRate*.45)))%1,dotX=px+(cx-px)*phase,dotY=py+(cy-py)*phase;
          ctx.globalAlpha=.55+.4*Math.sin(time*8);ctx.fillStyle='#e0f2fe';ctx.beginPath();ctx.arc(dotX,dotY,Math.max(1,tile*.045),0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      }
    }
  }
  linksFor(duct,world){
    const version=world.utilityTopologyVersion??0,cached=this.linkCache.get(duct);if(cached?.version===version)return cached.links;
    const links=[];
    for(const [dx,dy] of DIRS){const adjacent=world.utilityAt(duct.x+dx,duct.y+dy,'duct');if(adjacent){links.push([dx,dy]);continue;}const entity=world.entityAt(duct.x+dx,duct.y+dy);if(entity&&COOLING_ENDPOINTS.has(entity.type))links.push([dx,dy]);}
    this.linkCache.set(duct,{version,links});return links;
  }
  preview(ctx,x,y,tile,size,valid,zoom=1,{embedded=false}={}){const width=tile*.22,cx=(x+.5)*tile,cy=(y+.5)*tile;ctx.save();ctx.globalAlpha=.78;ctx.strokeStyle=valid?'#67e8f9':'#f87171';ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);if(embedded)ctx.setLineDash([tile*.12,tile*.08]);ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=Math.max(1,1.5/zoom);ctx.strokeRect(x*tile+1,y*tile,tile-2,tile);ctx.restore();}
}

function defaultCanvasFactory(width,height){
  if(typeof globalThis.OffscreenCanvas==='function')return new globalThis.OffscreenCanvas(width,height);
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
  return null;
}
