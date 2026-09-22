export class AirflowRenderer {
  draw(ctx,world,tile,time=0){
    ctx.save();
    ctx.lineCap='round';
    for(let y=1;y<world.height;y+=2)for(let x=1;x<world.width;x+=2){
      if(!world.isAir(x,y))continue;
      const i=world.index(x,y),vx=world.airX[i],vy=world.airY[i],speed=Math.hypot(vx,vy);
      if(speed<.12)continue;
      const nx=vx/speed,ny=vy/speed,cx=(x+.5)*tile,cy=(y+.5)*tile;
      const len=Math.min(tile*1.65,tile*(.35+speed*.23));
      const phase=(time*2.4+x*.37+y*.19)%1;
      const sx=cx-nx*len*.28+nx*phase*tile*.35,sy=cy-ny*len*.28+ny*phase*tile*.35;
      const ex=sx+nx*len,ey=sy+ny*len;
      const alpha=Math.min(.9,.22+speed*.13);
      ctx.strokeStyle='rgba(125,211,252,'+alpha+')';
      ctx.lineWidth=Math.max(1,tile*(.055+Math.min(.05,speed*.009)));
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo((sx+ex)/2-ny*tile*.08,(sy+ey)/2+nx*tile*.08,ex,ey);ctx.stroke();
      const ah=Math.max(2,tile*.16);
      ctx.fillStyle='rgba(186,230,253,'+alpha+')';
      ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-nx*ah-ny*ah*.55,ey-ny*ah+nx*ah*.55);ctx.lineTo(ex-nx*ah+ny*ah*.55,ey-ny*ah-nx*ah*.55);ctx.closePath();ctx.fill();
    }
    ctx.restore();
  }
}
