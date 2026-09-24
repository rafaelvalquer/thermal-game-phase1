export class CoolingUnitRenderer {
  draw(ctx,unit,tile,zoom=1){
    const x=(unit.x+.5)*tile,y=(unit.y+.5)*tile,w=tile*.72,h=Math.max(2,tile*.055),load=Math.max(0,Math.min(1,unit.loadRatio||0));
    ctx.save();ctx.fillStyle='rgba(2,6,23,.9)';ctx.fillRect(x-w/2,y+tile*.52,w,h);
    ctx.fillStyle=unit.status==='OVERLOAD'?'#fb7185':'#38bdf8';ctx.fillRect(x-w/2,y+tile*.52,w*load,h);
    ctx.strokeStyle='rgba(226,232,240,.6)';ctx.lineWidth=Math.max(.6,.8/zoom);ctx.strokeRect(x-w/2,y+tile*.52,w,h);
    ctx.fillStyle=unit.status==='OVERLOAD'?'#fecdd3':'#bae6fd';ctx.font='700 '+Math.max(6,tile*.21)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.fillText(unit.unitLabel||unit.missionId||'AC',x,y-tile*.46);ctx.restore();
  }
}
