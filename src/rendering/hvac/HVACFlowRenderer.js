import { HVAC } from '../../simulation/hvac/HVACConstants.js';

export class HVACFlowRenderer {
  draw(ctx,world,tile,time,zoom=1){
    const byId=new Map([...world.entities,...world.allUtilities()].map(item=>[item.id,item]));
    ctx.save();ctx.fillStyle='#f8fafc';
    for(const duct of world.allUtilities().filter(item=>HVAC.ductTypes.has(item.type)&&item.flowRate>.005&&item.downstreamId)){
      const next=byId.get(duct.downstreamId);if(!next)continue;
      const ax=(duct.x+.5)*tile,ay=(duct.y+.5)*tile,bx=(next.x+.5)*tile,by=(next.y+.5)*tile;
      const phase=(time*(.5+duct.flowRate*.25)+duct.id*.173)%1,px=ax+(bx-ax)*phase,py=ay+(by-ay)*phase;
      const angle=Math.atan2(by-ay,bx-ax),size=Math.max(2,tile*.13);
      ctx.save();ctx.translate(px,py);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.7,-size*.55);ctx.lineTo(-size*.7,size*.55);ctx.closePath();ctx.fill();ctx.restore();
      ctx.strokeStyle='rgba(255,255,255,.38)';ctx.lineWidth=Math.max(.6,.8/zoom);ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
    }
    ctx.restore();
  }
}
