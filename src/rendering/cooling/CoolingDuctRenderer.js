const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
export class CoolingDuctRenderer {
  draw(ctx,world,tile,mode='normal',zoom=1){
    for(const duct of world.allUtilities().filter(item=>item.type==='duct')){
      const cx=(duct.x+.5)*tile,cy=(duct.y+.5)*tile,links=DIRS.filter(([dx,dy])=>{const adjacent=world.utilityAt(duct.x+dx,duct.y+dy,'duct');if(adjacent&&adjacent.networkId===duct.networkId)return true;const entity=world.entityAt(duct.x+dx,duct.y+dy);return entity&&(['supplyVent','coolingUnit'].includes(entity.type))&&(entity.networkId===duct.networkId||entity.networkId?.split(',').includes(duct.networkId));});
      const color=mode==='thermal'?'#34495e':duct.networkStatus==='READY'?'#38bdf8':'#8292a8',width=tile*.22;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
      const stroke=()=>{ctx.beginPath();for(const [dx,dy] of links){ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.55,cy+dy*tile*.55);}if(!links.length){ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);}ctx.stroke();};
      ctx.strokeStyle='rgba(2,6,23,.94)';ctx.lineWidth=width+tile*.13;stroke();ctx.strokeStyle=color;ctx.lineWidth=width;if(mode==='cooling'&&duct.networkStatus!=='READY')ctx.setLineDash([tile*.13,tile*.09]);stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.beginPath();ctx.arc(cx,cy,Math.max(1,width*.42),0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }
  preview(ctx,x,y,tile,size,valid,zoom=1,{embedded=false}={}){const width=tile*.22,cx=(x+.5)*tile,cy=(y+.5)*tile;ctx.save();ctx.globalAlpha=.78;ctx.strokeStyle=valid?'#67e8f9':'#f87171';ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(cx-tile*.36,cy);ctx.lineTo(cx+tile*.36,cy);if(embedded)ctx.setLineDash([tile*.12,tile*.08]);ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=Math.max(1,1.5/zoom);ctx.strokeRect(x*tile+1,y*tile,tile-2,tile);ctx.restore();}
}

