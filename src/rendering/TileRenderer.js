export class TileRenderer {
  draw(ctx,world,tile){
    for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
      const m=world.materialAt(x,y),px=x*tile,py=y*tile;
      if(m.id==='air') this.floor(ctx,x,y,px,py,tile);
      else this.material(ctx,m,x,y,px,py,tile);
    }
    this.grid(ctx,world,tile);
  }

  floor(ctx,x,y,px,py,tile){
    const panel=((Math.floor(x/2)+Math.floor(y/2))&1);
    ctx.fillStyle=panel?'#0c1623':'#0a131f';
    ctx.fillRect(px,py,tile,tile);
    if((x%4===0||y%4===0)){
      ctx.fillStyle='rgba(148,163,184,.025)';
      ctx.fillRect(px,py,tile,tile);
    }
    if(x>=9&&x<=54&&y>=11&&y<=45&&((x+y)%13===0)){
      ctx.fillStyle='rgba(148,163,184,.14)';
      ctx.beginPath();
      ctx.arc(px+tile*.18,py+tile*.18,Math.max(.6,tile*.045),0,Math.PI*2);
      ctx.fill();
    }
  }

  material(ctx,m,x,y,px,py,tile){
    if(m.id==='concrete'){
      ctx.fillStyle='#4b5563';ctx.fillRect(px,py,tile,tile);
      ctx.fillStyle='#5f6978';ctx.fillRect(px+1,py+1,tile-2,Math.max(2,tile*.22));
      ctx.strokeStyle='rgba(15,23,42,.55)';ctx.lineWidth=Math.max(.5,tile*.035);
      ctx.strokeRect(px+.5,py+.5,tile-1,tile-1);
      if((x+y)&1){ctx.beginPath();ctx.moveTo(px,py+tile*.58);ctx.lineTo(px+tile,py+tile*.58);ctx.stroke();}
      return;
    }
    if(m.id==='insulation'){
      ctx.fillStyle='#b9a96b';ctx.fillRect(px,py,tile,tile);
      ctx.strokeStyle='rgba(255,251,235,.42)';ctx.lineWidth=Math.max(1,tile*.08);
      for(let o=-tile;o<tile*2;o+=tile*.38){ctx.beginPath();ctx.moveTo(px+o,py+tile);ctx.lineTo(px+o+tile,py);ctx.stroke();}
      ctx.strokeStyle='#665d3c';ctx.lineWidth=Math.max(.5,tile*.035);ctx.strokeRect(px+.5,py+.5,tile-1,tile-1);
      return;
    }
    if(m.id==='copper'){
      const g=ctx.createLinearGradient(px,py,px+tile,py+tile);
      g.addColorStop(0,'#7c2d12');g.addColorStop(.45,'#d97745');g.addColorStop(.6,'#f0a46a');g.addColorStop(1,'#8b3d1e');
      ctx.fillStyle=g;ctx.fillRect(px,py,tile,tile);
      ctx.strokeStyle='rgba(69,26,3,.75)';ctx.strokeRect(px+.5,py+.5,tile-1,tile-1);
      ctx.fillStyle='rgba(255,237,213,.45)';
      ctx.beginPath();ctx.arc(px+tile*.2,py+tile*.2,Math.max(.7,tile*.05),0,Math.PI*2);ctx.fill();
      return;
    }
    ctx.fillStyle=m.color;ctx.fillRect(px,py,tile,tile);
  }

  grid(ctx,world,tile){
    ctx.strokeStyle='rgba(148,163,184,.055)';
    ctx.lineWidth=.5;
    for(let x=0;x<=world.width;x++){ctx.beginPath();ctx.moveTo(x*tile,0);ctx.lineTo(x*tile,world.height*tile);ctx.stroke();}
    for(let y=0;y<=world.height;y++){ctx.beginPath();ctx.moveTo(0,y*tile);ctx.lineTo(world.width*tile,y*tile);ctx.stroke();}
  }
}
