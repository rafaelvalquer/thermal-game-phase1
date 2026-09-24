export class CoolingFlowRenderer {
  draw(ctx,networks,tile,time,zoom=1){
    ctx.save();ctx.lineCap='round';
    for(const network of networks||[]){
      if(network.status!=='READY')continue;
      for(const path of network.paths){
        if(path.flowRate<=.001)continue;
        const points=[{x:network.sourceUnit.x+.5,y:network.sourceUnit.y+.5},...path.path.map(duct=>({x:duct.x+.5,y:duct.y+.5})),{x:path.vent.x+.5,y:path.vent.y+.5}];
        let length=0,segments=[];
        for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b.x-a.x,b.y-a.y);segments.push({a,b,start:length,length:d});length+=d;}
        if(!length)continue;
        const color='#cffafe',count=Math.max(1,Math.min(24,Math.ceil(path.flowRate*4*zoom)));
        for(let p=0;p<count;p++){
          const distance=(time*(.8+path.flowRate*.18)+p/count)%1*length,segment=segments.find(s=>distance>=s.start&&distance<=s.start+s.length)||segments[segments.length-1],f=(distance-segment.start)/segment.length;
          const x=(segment.a.x+(segment.b.x-segment.a.x)*f)*tile,y=(segment.a.y+(segment.b.y-segment.a.y)*f)*tile,r=Math.max(1.2,tile*.055);
          ctx.globalAlpha=.45+.45*Math.sin((time*6+p)*Math.PI);ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
        }
        const x=(path.vent.x+.5)*tile,y=(path.vent.y+.5)*tile;ctx.globalAlpha=.9;ctx.fillStyle='#e0f2fe';ctx.font='700 '+Math.max(6,tile*.18)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(Math.round(path.flowRate/Math.max(.001,network.sourceUnit.maxAirFlow)*100)+'%',x,y+tile*.38);
      }
    }
    ctx.restore();
  }
}
