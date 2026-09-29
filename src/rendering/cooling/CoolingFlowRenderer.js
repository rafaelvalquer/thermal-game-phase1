import { waterCss } from '../VisualTheme.js';
import { ViewportCulling } from '../ViewportCulling.js';
import { CoolingPathGeometryCache } from './CoolingPathGeometryCache.js';

export class CoolingFlowRenderer {
  constructor({monitor=null}={}){this.monitor=monitor;this.geometryCache=new CoolingPathGeometryCache({monitor});}
  draw(ctx,networks,tile,time,zoom=1,selected=null,bounds=null){
    const viewport=ViewportCulling.fromBounds(bounds,tile,2);
    const selectsCooling=Boolean(selected&&['coolingUnit','supplyVent','duct'].includes(selected.type));
    const selectedIds=String(selected?.networkId||'').split(',').filter(Boolean);
    ctx.save();ctx.lineCap='round';
    for(const network of networks||[]){
      if(network.status!=='READY')continue;
      const focused=!selectsCooling||(selectedIds.length?selectedIds.includes(network.id):(network.ducts.includes(selected)||network.vents.includes(selected)||network.sourceUnits.includes(selected)));
      const networkAlpha=focused?1:.14;ctx.globalAlpha=networkAlpha;
      for(const path of network.paths){
        if(path.flowRate<=.001)continue;
        const unit=path.unit||network.sourceUnit;
        if(!unit)continue;
        const {segments,totalLength}=this.geometryCache.get(path,network);if(!totalLength)continue;
        const airTemperature=Number.isFinite(path.vent.airTemperature)?path.vent.airTemperature:(unit.supplyTemperature??16);
        const color=waterCss(airTemperature,.98),count=Math.max(1,Math.min(24,Math.ceil(path.flowRate*4*zoom))),speed=.8+Math.min(2.4,path.flowRate*1.15);
        for(let p=0;p<count;p++){
          const distance=(time*speed+p/count)%1*totalLength,segment=CoolingPathGeometryCache.segmentAt(segments,distance),f=(distance-segment.start)/segment.length;
          const worldX=segment.ax+segment.dx*f,worldY=segment.ay+segment.dy*f;if(!viewport.contains(worldX,worldY))continue;
          const x=worldX*tile,y=worldY*tile,r=Math.max(1.2,tile*(.042+Math.min(.025,path.flowRate*.012)));
          const dx=segment.dx/segment.length,dy=segment.dy/segment.length;
          ctx.globalAlpha=networkAlpha*(.48+.34*Math.sin((time*5+p)*Math.PI));ctx.strokeStyle=color;ctx.lineWidth=Math.max(.8,r*.65);ctx.beginPath();ctx.moveTo(x-dx*r*2.4,y-dy*r*2.4);ctx.lineTo(x+dx*r*.8,y+dy*r*.8);ctx.stroke();
          ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
        }
      }
      let maximum=0;if(network.sourceUnits?.length){for(const unit of network.sourceUnits)maximum+=unit.maxAirFlow||0;}else maximum=network.sourceUnit?.maxAirFlow||0;
      for(const vent of network.vents||[]){
        if(vent.flowRate<=.001||!viewport.contains(vent.x,vent.y))continue;
        const x=(vent.x+.5)*tile,y=(vent.y+.5)*tile;ctx.globalAlpha=networkAlpha*.9;ctx.fillStyle='#e0f2fe';ctx.font='700 '+Math.max(6,tile*.18)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(Math.round(vent.flowRate/Math.max(.001,maximum)*100)+'%',x,y+tile*.38);
      }
    }
    ctx.globalAlpha=1;
    ctx.restore();
  }
}
