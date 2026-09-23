import { resolveSpriteState } from './SpriteDefinition.js';

export class SpriteEffects {
  drawShadow(ctx,x,y,width,height){
    const gradient=ctx.createRadialGradient(x+width*.5,y+height*.76,0,x+width*.5,y+height*.76,width*.48);
    gradient.addColorStop(0,'rgba(0,0,0,.43)');gradient.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(x+width*.5,y+height*.78,width*.47,height*.17,0,0,Math.PI*2);ctx.fill();
  }
  drawThermalGlow(ctx,entity,x,y,width,height){
    const temperature=Number.isFinite(entity.waterTemperature)?entity.waterTemperature:
      Number.isFinite(entity.temperature)?entity.temperature:
      Number.isFinite(entity.heatOutput)&&entity.heatOutput>0?35+Math.min(45,entity.heatOutput/500):null;
    if(!Number.isFinite(temperature)||temperature<35)return;
    const color=temperature>=80?'#ef4444':temperature>=60?'#f97316':'#f59e0b';
    const strength=Math.min(.34,(temperature-32)/160);
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=strength;
    const glow=ctx.createRadialGradient(x+width*.5,y+height*.64,0,x+width*.5,y+height*.64,width*.55);
    glow.addColorStop(0,color);glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(x-width*.05,y-height*.04,width*1.1,height*1.1);ctx.restore();
  }
  drawState(ctx,entity,x,y,width,height,time,{selected=false,preview=false,valid=true}={}){
    const state=resolveSpriteState(entity);
    const pulse=.5+.5*Math.sin(time*5+(Number(entity.id)||0));
    const color=state==='critical'?'#fb7185':state==='warning'?'#fbbf24':state==='off'?'#64748b':state==='running'?'#34d399':'#94a3b8';
    const ledX=x+width*.79,ledY=y+height*.28,ledRadius=Math.max(1.5,width*.034);
    ctx.save();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=state==='critical'?width*.12:width*.055;
    ctx.globalAlpha=state==='critical'?.5+pulse*.5:state==='idle'?.55:.92;
    ctx.beginPath();ctx.arc(ledX,ledY,ledRadius,0,Math.PI*2);ctx.fill();ctx.restore();
    if(state==='warning'||state==='critical'){
      const ax=x+width*.88,ay=y+height*.16,size=Math.max(4,width*.09);
      ctx.save();ctx.fillStyle=state==='critical'?'#fb7185':'#fbbf24';ctx.globalAlpha=state==='critical'?.65+pulse*.35:.95;
      ctx.beginPath();ctx.moveTo(ax,ay-size*.55);ctx.lineTo(ax+size*.52,ay+size*.42);ctx.lineTo(ax-size*.52,ay+size*.42);ctx.closePath();ctx.fill();
      ctx.fillStyle='#111827';ctx.font='900 '+Math.max(5,size*.56)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',ax,ay+size*.13);ctx.restore();
    }
    if(state==='warning'||state==='critical'){
      ctx.save();ctx.strokeStyle=state==='critical'?'#fb7185':'#fbbf24';ctx.globalAlpha=state==='critical'?.6+pulse*.4:.85;
      ctx.lineWidth=Math.max(1.5,width*.035);ctx.setLineDash([width*.08,width*.045]);ctx.strokeRect(x+width*.08,y+height*.15,width*.84,height*.68);ctx.restore();
    }
    if(state==='off'){
      ctx.fillStyle='rgba(2,6,23,.28)';ctx.fillRect(x+width*.12,y+height*.18,width*.76,height*.58);
    }
    if(selected){ctx.strokeStyle='#67e8f9';ctx.lineWidth=Math.max(1.5,width*.035);ctx.strokeRect(x+width*.06,y+height*.12,width*.88,height*.72);}
    if(preview){ctx.strokeStyle=valid?'#22d3ee':'#fb7185';ctx.lineWidth=Math.max(1.5,width*.04);ctx.setLineDash([width*.09,width*.05]);ctx.strokeRect(x+width*.05,y+height*.1,width*.9,height*.76);ctx.setLineDash([]);}
  }
}
