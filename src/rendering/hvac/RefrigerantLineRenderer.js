import { HVACPortResolver } from '../../simulation/hvac/ports/HVACPortResolver.js';

const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

export class RefrigerantLineRenderer {
  constructor(){this.ports=new HVACPortResolver();}
  draw(ctx,world,tile,mode='normal',time=0,zoom=1){
    for(const line of world.allUtilities().filter(item=>item.type==='refrigerantLine')){
      if(line.embedded&&mode!=='hvac')continue;
      const x=line.x,y=line.y,cx=(x+.5)*tile,cy=(y+.5)*tile;
      const links=dirs.filter(([dx,dy])=>world.utilitiesAt(x+dx,y+dy).some(item=>item.type==='refrigerantLine')||
        ['airHandler','condenser'].some(type=>{const endpoint=world.entityAt(x+dx,y+dy);return endpoint?.type===type&&this.ports.portForCell(endpoint,x,y,'refrigerant');}));
      const invalid=line.circuitStatus!=='READY'&&line.circuitStatus!=='LINE TOO LONG';
      const color=invalid?'#ef4444':'#c084fc',separation=Math.max(1,tile*.065),width=Math.max(1,tile*.075);
      ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      const pair=(offset)=>{
        ctx.beginPath();for(const [dx,dy] of links){const ox=-dy*offset,oy=dx*offset;ctx.moveTo(cx+ox,cy+oy);ctx.lineTo(cx+dx*tile*.55+ox,cy+dy*tile*.55+oy);}
        if(!links.length){ctx.moveTo(cx-tile*.34,cy+offset);ctx.lineTo(cx+tile*.34,cy+offset);}ctx.stroke();
      };
      ctx.strokeStyle='rgba(2,6,23,.94)';ctx.lineWidth=width+tile*.08;pair(separation);pair(-separation);
      ctx.strokeStyle=color;ctx.lineWidth=width;if(line.embedded)ctx.setLineDash([tile*.16,tile*.1]);pair(separation);pair(-separation);ctx.setLineDash([]);
      if(line.circuitStatus==='READY'&&links.length){
        const phase=(time*.42+Number(line.id)*.037)%1;
        const [dx,dy]=links[Math.floor(phase*links.length)%links.length],local=phase*links.length%1;
        ctx.fillStyle='#f3e8ff';for(const offset of [-separation,separation]){ctx.beginPath();ctx.arc(cx+dx*tile*local-dy*offset,cy+dy*tile*local+dx*offset,Math.max(1.3,tile*.045),0,Math.PI*2);ctx.fill();}
      }
      if(mode==='hvac'){ctx.strokeStyle='rgba(255,255,255,.34)';ctx.lineWidth=Math.max(.5,.8/zoom);ctx.setLineDash([tile*.06,tile*.06]);ctx.beginPath();ctx.arc(cx,cy,tile*.3,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      ctx.restore();
    }
  }
  preview(ctx,x,y,tile,valid,zoom=1,{embedded=false,blockedPort=false}={}){
    const color=blockedPort?'#ef4444':valid?'#c084fc':'#fb7185',gap=tile*.065;
    ctx.save();ctx.globalAlpha=.86;ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.2,tile*.07);ctx.lineCap='round';
    if(embedded)ctx.setLineDash([tile*.14,tile*.09]);
    ctx.beginPath();ctx.moveTo(x*tile+tile*.14,y*tile+tile*.43);ctx.lineTo(x*tile+tile*.86,y*tile+tile*.43);ctx.moveTo(x*tile+tile*.14,y*tile+tile*.57);ctx.lineTo(x*tile+tile*.86,y*tile+tile*.57);ctx.stroke();ctx.setLineDash([]);
    ctx.lineWidth=Math.max(1,1.5/zoom);ctx.strokeRect(x*tile+1,y*tile+1,tile-2,tile-2);ctx.restore();
  }
}
