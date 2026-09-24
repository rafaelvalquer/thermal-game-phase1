const PALETTE=['#38bdf8','#a78bfa','#34d399','#f59e0b','#f472b6','#22d3ee'];
export class CoolingOverlayRenderer {
  draw(ctx,world,tile,time,zoom=1,selected=null){
    const system=world.coolingSystem;if(!system)return;
    const selectedNetwork=selected?.networkId||null;
    ctx.save();
    system.networks.forEach((network,index)=>{
      const focused=!selectedNetwork||selectedNetwork.split(',').includes(network.id)||network.ducts.some(duct=>duct===selected);
      const color=PALETTE[index%PALETTE.length];ctx.globalAlpha=focused?.9:.16;
      for(const duct of network.ducts){
        if(network.status!=='READY'){
          const x=(duct.x+.5)*tile,y=(duct.y+.5)*tile;ctx.fillStyle='#7f1d1d';ctx.strokeStyle='#fca5a5';ctx.lineWidth=Math.max(1,1/zoom);ctx.beginPath();ctx.arc(x,y,tile*.2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='900 '+Math.max(7,tile*.2)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',x,y);
        }else{ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,tile*.37);ctx.globalAlpha=focused?.22:.06;ctx.strokeRect(duct.x*tile+tile*.16,duct.y*tile+tile*.16,tile*.68,tile*.68);ctx.globalAlpha=focused?.9:.16;}
      }
      const unit=network.sourceUnit;if(unit&&focused){const x=(unit.x+.5)*tile,y=(unit.y+.5)*tile-tile*.55;ctx.fillStyle='#020617';ctx.fillRect(x-tile*.47,y-tile*.18,tile*.94,tile*.36);ctx.fillStyle=color;ctx.font='800 '+Math.max(6,tile*.18)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(unit.unitLabel||unit.missionId||'AC',x,y);}
    });
    if(selected?.type==='coolingUnit')system.networks.filter(network=>network.sourceUnit===selected).forEach(network=>{
      for(const vent of network.vents){ctx.strokeStyle='#bae6fd';ctx.lineWidth=Math.max(1,1.3/zoom);ctx.setLineDash([tile*.14,tile*.12]);ctx.beginPath();ctx.moveTo((selected.x+.5)*tile,(selected.y+.5)*tile);ctx.lineTo((vent.x+.5)*tile,(vent.y+.5)*tile);ctx.stroke();ctx.setLineDash([]);}
    });
    ctx.restore();
  }
}
