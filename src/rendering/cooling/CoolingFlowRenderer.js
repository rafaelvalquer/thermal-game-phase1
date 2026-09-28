import { waterCss } from '../VisualTheme.js';

export class CoolingFlowRenderer {
  draw(ctx,networks,tile,time,zoom=1,selected=null){
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
        const points=[{x:unit.x+.5,y:unit.y+.5},...path.path.map(duct=>({x:duct.x+.5,y:duct.y+.5})),{x:path.vent.x+.5,y:path.vent.y+.5}];
        let length=0,segments=[];
        for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b.x-a.x,b.y-a.y);segments.push({a,b,start:length,length:d});length+=d;}
        if(!length)continue;
        const airTemperature=Number.isFinite(path.vent.airTemperature)?path.vent.airTemperature:(unit.supplyTemperature??16);
        const color=waterCss(airTemperature,.98),count=Math.max(1,Math.min(24,Math.ceil(path.flowRate*4*zoom))),speed=.8+Math.min(2.4,path.flowRate*1.15);
        for(let p=0;p<count;p++){
          const distance=(time*speed+p/count)%1*length,segment=segments.find(s=>distance>=s.start&&distance<=s.start+s.length)||segments[segments.length-1],f=(distance-segment.start)/segment.length;
          const x=(segment.a.x+(segment.b.x-segment.a.x)*f)*tile,y=(segment.a.y+(segment.b.y-segment.a.y)*f)*tile,r=Math.max(1.2,tile*(.042+Math.min(.025,path.flowRate*.012)));
          const dx=(segment.b.x-segment.a.x)/segment.length,dy=(segment.b.y-segment.a.y)/segment.length;
          ctx.globalAlpha=networkAlpha*(.48+.34*Math.sin((time*5+p)*Math.PI));ctx.strokeStyle=color;ctx.lineWidth=Math.max(.8,r*.65);ctx.beginPath();ctx.moveTo(x-dx*r*2.4,y-dy*r*2.4);ctx.lineTo(x+dx*r*.8,y+dy*r*.8);ctx.stroke();
          ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
        }
      }
      const maximum=[...new Set(network.paths.map(path=>path.unit||network.sourceUnit))].reduce((sum,unit)=>sum+(unit?.maxAirFlow||0),0);
      for(const vent of network.vents||[]){
        if(vent.flowRate<=.001)continue;
        const x=(vent.x+.5)*tile,y=(vent.y+.5)*tile;ctx.globalAlpha=networkAlpha*.9;ctx.fillStyle='#e0f2fe';ctx.font='700 '+Math.max(6,tile*.18)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(Math.round(vent.flowRate/Math.max(.001,maximum)*100)+'%',x,y+tile*.38);
      }
    }
    ctx.globalAlpha=1;
    ctx.restore();
  }
}
