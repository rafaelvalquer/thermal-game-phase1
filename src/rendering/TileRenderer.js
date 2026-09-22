export class TileRenderer {
  draw(ctx,world,tile){
    for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){const m=world.materialAt(x,y);ctx.fillStyle=m.color;ctx.fillRect(x*tile,y*tile,tile,tile);if(m.id==='air'){ctx.fillStyle=((x+y)&1)?'#111827':'#0f172a';ctx.fillRect(x*tile,y*tile,tile,tile);} }
    ctx.strokeStyle='rgba(148,163,184,.08)';ctx.lineWidth=.5;for(let x=0;x<=world.width;x++){ctx.beginPath();ctx.moveTo(x*tile,0);ctx.lineTo(x*tile,world.height*tile);ctx.stroke();}for(let y=0;y<=world.height;y++){ctx.beginPath();ctx.moveTo(0,y*tile);ctx.lineTo(world.width*tile,y*tile);ctx.stroke();}
  }
}
