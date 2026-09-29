import { ViewportCulling } from '../ViewportCulling.js';

const PALETTE=['#38bdf8','#a78bfa','#34d399','#f59e0b','#f472b6','#22d3ee'];
export class CoolingOverlayRenderer {
  draw(ctx,world,tile,time,zoom=1,selected=null,bounds=null){
    const system=world.coolingSystem;if(!system)return;
    const viewport=ViewportCulling.fromBounds(bounds,tile,2);
    const selectedNetwork=String(selected?.networkId||'').split(',').filter(Boolean),selectsCooling=Boolean(selected&&['coolingUnit','supplyVent','duct'].includes(selected.type));
    ctx.save();
    system.networks.forEach((network,index)=>{
      const focused=!selectsCooling||(selectedNetwork.length?selectedNetwork.includes(network.id):(network.ducts.includes(selected)||network.vents.includes(selected)||network.sourceUnits.includes(selected)));
      const color=PALETTE[index%PALETTE.length];ctx.globalAlpha=focused?.9:.16;
      for(const duct of network.ducts){
        if(!viewport.contains(duct.x,duct.y))continue;
        if(network.status!=='READY'){
          const x=(duct.x+.5)*tile,y=(duct.y+.5)*tile;ctx.fillStyle='#7f1d1d';ctx.strokeStyle='#fca5a5';ctx.lineWidth=Math.max(1,1/zoom);ctx.beginPath();ctx.arc(x,y,tile*.2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 '+Math.max(7,tile*.2)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',x,y);
        }else{ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,tile*.37);ctx.globalAlpha=focused?.22:.06;ctx.strokeRect(duct.x*tile+tile*.16,duct.y*tile+tile*.16,tile*.68,tile*.68);ctx.globalAlpha=focused?.9:.16;}
      }
      if(focused)for(const unit of network.sourceUnits){if(!viewport.contains(unit.x,unit.y))continue;const x=(unit.x+.5)*tile,y=(unit.y+.5)*tile-tile*.55;ctx.fillStyle='#020617';ctx.fillRect(x-tile*.47,y-tile*.18,tile*.94,tile*.36);ctx.fillStyle=color;ctx.font='800 '+Math.max(6,tile*.18)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(unit.unitLabel||unit.missionId||'AC',x,y);}
    });
    if(selectsCooling)for(const network of system.networks){
      const focused=selectedNetwork.length?selectedNetwork.includes(network.id):network.ducts.includes(selected)||network.vents.includes(selected)||network.sourceUnits.includes(selected);
      if(!focused)continue;
      for(const path of network.paths||[]){
        const unit=path.unit||network.sourceUnit;if(!unit)continue;
        const points=[{x:unit.x+.5,y:unit.y+.5},...path.path.map(duct=>({x:duct.x+.5,y:duct.y+.5})),{x:path.vent.x+.5,y:path.vent.y+.5}];
        ctx.strokeStyle=network.status==='READY'?'rgba(186,230,253,.48)':'rgba(251,113,133,.82)';ctx.lineWidth=Math.max(1,1/zoom);ctx.setLineDash([tile*.12,tile*.1]);ctx.beginPath();ctx.moveTo(points[0].x*tile,points[0].y*tile);for(const point of points.slice(1))ctx.lineTo(point.x*tile,point.y*tile);ctx.stroke();ctx.setLineDash([]);
      }
      for(const endpoint of [...network.sourceUnits,...network.vents]){
        const x=(endpoint.x+.5)*tile,y=(endpoint.y+.5)*tile;ctx.globalAlpha=.8;ctx.strokeStyle=network.status==='READY'?'#7dd3fc':'#fb7185';ctx.lineWidth=Math.max(1.2,1.6/zoom);ctx.beginPath();ctx.arc(x,y,tile*.34,0,Math.PI*2);ctx.stroke();
      }
    }
    ctx.restore();
  }
}
