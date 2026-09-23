import { HVAC } from '../../simulation/hvac/HVACConstants.js';

export class HVACOverlayRenderer {
  draw(ctx,world,tile,time,zoom=1){
    for(const zone of world.zones||[]){
      const pressure=world.hvacZonePressure?.get(zone.id)||0;if(Math.abs(pressure)<.3)continue;
      const y=(zone.y+.28)*tile,label=(pressure>0?'+':'')+pressure.toFixed(1)+' Pa';
      ctx.save();ctx.font='700 '+Math.max(7,tile*.23)+'px system-ui';const width=ctx.measureText(label).width+tile*.22,x=(zone.x+zone.width)*tile-width-tile*.18;
      ctx.fillStyle='rgba(8,18,32,.88)';ctx.strokeStyle=pressure>0?'rgba(251,146,60,.8)':'rgba(96,165,250,.8)';ctx.lineWidth=Math.max(.7,1/zoom);
      ctx.beginPath();ctx.roundRect(x,y,width,tile*.38,tile*.08);ctx.fill();ctx.stroke();ctx.fillStyle=pressure>0?'#fdba74':'#93c5fd';ctx.textBaseline='middle';ctx.fillText(label,x+tile*.11,y+tile*.19);ctx.restore();
    }
    const networks=world.hvac?.networks||[];
    for(const network of networks)for(const junction of network.junctions){
      const x=(junction.x+.5)*tile,y=(junction.y+.5)*tile;ctx.save();ctx.fillStyle='#ddd6fe';ctx.strokeStyle='#6d28d9';ctx.lineWidth=Math.max(1,1/zoom);ctx.beginPath();ctx.arc(x,y,tile*.12,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
    }
    for(const network of networks)for(const duct of network.deadEnds){
      const x=(duct.x+.5)*tile,y=(duct.y+.5)*tile;ctx.save();ctx.fillStyle='rgba(127,29,29,.94)';ctx.strokeStyle='#fca5a5';ctx.lineWidth=Math.max(1,1/zoom);
      ctx.beginPath();ctx.arc(x,y,tile*.2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff1f2';ctx.font='900 '+Math.max(7,tile*.22)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',x,y);ctx.restore();
    }
    for(const handler of world.entitiesByType('airHandler')){
      if(handler.status==='READY')continue;
      const x=(handler.x+.5)*tile,y=(handler.y-0.25)*tile,label=handler.status;
      ctx.save();ctx.font='700 '+Math.max(7,tile*.28)+'px system-ui';const width=ctx.measureText(label).width+tile*.24;
      ctx.fillStyle='rgba(69,10,10,.92)';ctx.fillRect(x-width/2,y-tile*.36,width,tile*.42);ctx.strokeStyle='#fb7185';ctx.lineWidth=Math.max(1,1/zoom);ctx.strokeRect(x-width/2,y-tile*.36,width,tile*.42);
      ctx.fillStyle='#fecdd3';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x,y-tile*.15);ctx.restore();
    }
    for(const duct of world.allUtilities().filter(item=>HVAC.ductTypes.has(item.type)&&item.networkStatus!=='READY')){
      const x=(duct.x+.5)*tile,y=(duct.y+.5)*tile;ctx.save();ctx.strokeStyle='#fb7185';ctx.lineWidth=Math.max(1.5,2/zoom);ctx.beginPath();ctx.moveTo(x-tile*.15,y-tile*.15);ctx.lineTo(x+tile*.15,y+tile*.15);ctx.moveTo(x+tile*.15,y-tile*.15);ctx.lineTo(x-tile*.15,y+tile*.15);ctx.stroke();ctx.restore();
    }
  }
}
