import { HVAC } from '../../simulation/hvac/HVACConstants.js';
import { HVACPortResolver } from '../../simulation/hvac/ports/HVACPortResolver.js';

const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
const ROLE_COLORS={supply:'#38bdf8',return:'#fb923c',invalid:'#ef4444'};

export class DuctRenderer {
  constructor(){this.ports=new HVACPortResolver();}
  draw(ctx,world,tile,mode='normal',zoom=1){
    for(const duct of world.allUtilities().filter(item=>HVAC.ductTypes.has(item.type))){
      if(duct.embedded&&mode!=='hvac')continue;
      const cx=(duct.x+.5)*tile,cy=(duct.y+.5)*tile;
      const links=dirs.filter(([dx,dy])=>{
        const utilities=world.utilitiesAt(duct.x+dx,duct.y+dy),otherDuct=utilities.find(item=>HVAC.ductTypes.has(item.type));
        if(otherDuct&&otherDuct.networkId===duct.networkId)return true;
        const entity=world.entityAt(duct.x+dx,duct.y+dy);
        if(entity&&['supplyVent','returnVent'].includes(entity.type)&&entity.networkId===duct.networkId)return true;
        if(entity?.type==='airHandler'&&this.ports.portForCell(entity,duct.x,duct.y,duct.networkRole))return true;
        return false;
      });
      const role=duct.networkRole,color=ROLE_COLORS[role]|| (duct.networkStatus==='DISCONNECTED'||duct.networkStatus==='NO AIR HANDLER'?'#8292a8':'#ef4444');
      const width=tile*(duct.type==='smallDuct'?.15:duct.type==='largeDuct'?.29:.22);
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      const strokeLinks=()=>{ctx.beginPath();for(const [dx,dy] of links){ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.55,cy+dy*tile*.55);}if(!links.length){ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);}ctx.stroke();};
      ctx.strokeStyle='rgba(2,6,23,.94)';ctx.lineWidth=width+tile*.13;strokeLinks();
      ctx.strokeStyle=color;ctx.lineWidth=width;
      if(mode==='hvac'&&duct.embedded)ctx.setLineDash([tile*.13,tile*.09]);strokeLinks();ctx.setLineDash([]);
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(cx,cy,Math.max(1,width*.42),0,Math.PI*2);ctx.fill();
      if(mode==='hvac'){
        ctx.strokeStyle='rgba(255,255,255,.38)';ctx.lineWidth=Math.max(.5,.8/zoom);ctx.beginPath();ctx.arc(cx,cy,tile*.31,0,Math.PI*2);ctx.stroke();
      }
      const damper=world.utilityAt(duct.x,duct.y,'ductDamper');
      if(damper){
        const size=tile*.19;ctx.fillStyle='rgba(46,16,101,.96)';ctx.strokeStyle='#c4b5fd';ctx.lineWidth=Math.max(1,1/zoom);
        ctx.beginPath();ctx.roundRect(cx-size*1.25,cy-size*1.25,size*2.5,size*2.5,size*.35);ctx.fill();ctx.stroke();
        ctx.save();ctx.translate(cx,cy);ctx.rotate((1-damper.opening)*Math.PI/2);ctx.strokeStyle=damper.opening>0?'#ede9fe':'#fb7185';ctx.lineWidth=Math.max(1.3,size*.38);
        ctx.beginPath();ctx.moveTo(-size*.82,0);ctx.lineTo(size*.82,0);ctx.stroke();ctx.restore();
      }
      ctx.restore();
    }
  }
  preview(ctx,x,y,tile,size,valid,zoom=1,{embedded=false,role=null,color=null}={}){
    const width=tile*(size==='smallDuct'?.15:size==='largeDuct'?.29:.22),cx=(x+.5)*tile,cy=(y+.5)*tile;
    const tint=color||ROLE_COLORS[role]||(valid?'#67e8f9':'#f87171');
    ctx.save();ctx.globalAlpha=.78;ctx.strokeStyle=tint;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);if(embedded)ctx.setLineDash([tile*.12,tile*.08]);ctx.stroke();ctx.setLineDash([]);
    ctx.lineWidth=Math.max(1,1.5/zoom);ctx.strokeRect(x*tile+1,y*tile,tile-2,tile);ctx.restore();
  }
}
