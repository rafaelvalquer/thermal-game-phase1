import { resolveSpriteState } from './SpriteDefinition.js';
export class SpriteEffects {
  drawShadow(ctx,x,y,w,h){ctx.fillStyle='#10191e99';ctx.fillRect(x+w*.16,y+h*.81,w*.77,h*.12);ctx.fillRect(x+w*.23,y+h*.93,w*.65,h*.04);}
  drawThermalGlow(ctx,e,x,y,w,h){const t=e.temperature??e.waterTemperature??0;if(t<55)return;ctx.fillStyle=t>=80?'#e8756722':'#e3b65718';ctx.fillRect(x+w*.15,y+h*.25,w*.72,h*.6);}
  drawState(ctx,e,x,y,w,h,time,{selected=false,preview=false,valid=true}={}){
    const state=resolveSpriteState(e),alert=['warning','critical'].includes(state),color=state==='critical'?'#e87567':state==='warning'?'#e3b657':state==='running'?'#7ecb83':'#6e8588';
    ctx.save();ctx.fillStyle=color;const s=Math.max(1,w/32);ctx.fillRect(Math.round(x+w*.77),Math.round(y+h*.25),s*2,s);
    if(alert){const size=Math.max(5,w*.14),ax=x+w*.8,ay=y+h*.04;ctx.fillStyle=color;ctx.fillRect(ax,ay,size,size);ctx.fillStyle='#10191e';ctx.font='bold '+Math.max(5,size*.8)+'px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e.powerBlocked?'×':'!',ax+size/2,ay+size/2);}
    if(selected||preview){ctx.strokeStyle=preview?(valid?'#7ecb83':'#e87567'):'#e3b657';ctx.lineWidth=Math.max(1,w/32);ctx.strokeRect(x+w*.06,y+h*.12,w*.88,h*.76);}
    ctx.restore();
  }
}
