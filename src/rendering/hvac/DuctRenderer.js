import { HVAC } from '../../simulation/hvac/HVACConstants.js';
import { heatCss } from '../VisualTheme.js';

const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

export class DuctRenderer {
  draw(ctx,world,tile,mode='normal',zoom=1){
    for(const duct of world.allUtilities().filter(item=>HVAC.ductTypes.has(item.type))){
      const embedded=duct.embedded;if(embedded&&mode!=='hvac')continue;
      const alpha=.92,cx=(duct.x+.5)*tile,cy=(duct.y+.5)*tile;
      const links=dirs.filter(([dx,dy])=>{
        const utility=world.utilitiesAt(duct.x+dx,duct.y+dy).find(item=>HVAC.ductTypes.has(item.type));
        const equipment=world.entityAt(duct.x+dx,duct.y+dy);
        return Boolean(utility||equipment&&['airHandler','condenser','supplyVent','returnVent'].includes(equipment.type));
      });
      const width=tile*(duct.type==='smallDuct'?.16:duct.type==='largeDuct'?.3:.23);
      ctx.save();ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';
      if(mode==='hvac'&&embedded){ctx.strokeStyle='rgba(2,6,23,.86)';ctx.lineWidth=width+tile*.16;}
      else{ctx.strokeStyle='rgba(2,6,23,.9)';ctx.lineWidth=width+tile*.1;}
      ctx.beginPath();for(const [dx,dy] of links){ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.55,cy+dy*tile*.55);}if(!links.length){ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);}ctx.stroke();
      ctx.strokeStyle=heatCss(duct.airTemperature,.95,10,40);ctx.lineWidth=width;ctx.beginPath();for(const [dx,dy] of links){ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.55,cy+dy*tile*.55);}if(!links.length){ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);}ctx.stroke();
      ctx.fillStyle=heatCss(duct.airTemperature,1,10,40);ctx.beginPath();ctx.arc(cx,cy,Math.max(1,tile*width/tile*.45),0,Math.PI*2);ctx.fill();
      if(mode==='hvac'){ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=Math.max(.5,.8/zoom);ctx.beginPath();ctx.arc(cx,cy,tile*.3,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
    }
  }

  preview(ctx,x,y,tile,size,valid,zoom=1){
    const width=tile*(size==='smallDuct'?.16:size==='largeDuct'?.3:.23),cx=(x+.5)*tile,cy=(y+.5)*tile;
    ctx.save();ctx.globalAlpha=.72;ctx.strokeStyle=valid?'#67e8f9':'#f87171';ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);ctx.stroke();
    ctx.lineWidth=Math.max(1,1.5/zoom);ctx.strokeRect(x*tile+1,y*tile+1,tile-2,tile-2);ctx.restore();
  }
}
