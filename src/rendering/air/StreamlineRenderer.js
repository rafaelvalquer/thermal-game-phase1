const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class StreamlineRenderer {
  draw(ctx,lines,tile,time=0){
    ctx.save();
    ctx.lineCap='round';ctx.lineJoin='round';

    for(let li=0;li<lines.length;li++){
      const line=lines[li];
      if(line.points.length<3)continue;
      const speed=Math.max(.05,line.averageSpeed||0);
      const alpha=clamp(.17+speed*.095,.18,.72);
      const width=clamp(.7+speed*.12,.7,2.2);

      ctx.strokeStyle='rgba(56,189,248,'+alpha+')';
      ctx.lineWidth=width;
      ctx.beginPath();
      this.trace(ctx,line.points,tile);
      ctx.stroke();

      ctx.strokeStyle='rgba(224,242,254,'+clamp(alpha+.16,.2,.9)+')';
      ctx.lineWidth=Math.max(.8,width*.72);
      ctx.setLineDash([tile*.42,tile*.72]);
      ctx.lineDashOffset=-(time*(tile*(.65+speed*.58))+li*tile*.17);
      ctx.beginPath();
      this.trace(ctx,line.points,tile);
      ctx.stroke();
      ctx.setLineDash([]);

      if(line.loop){
        const p=line.points[Math.floor(line.points.length*.66)];
        ctx.fillStyle='rgba(186,230,253,'+clamp(alpha+.18,.2,.9)+')';
        ctx.font='700 '+Math.max(7,tile*.38)+'px system-ui';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('↻',p.x*tile,p.y*tile);
      }
    }
    ctx.restore();
  }

  trace(ctx,points,tile){
    const first=points[0];
    ctx.moveTo(first.x*tile,first.y*tile);
    if(points.length<3){
      for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x*tile,points[i].y*tile);
      return;
    }
    for(let i=1;i<points.length-1;i++){
      const p=points[i],n=points[i+1];
      ctx.quadraticCurveTo(p.x*tile,p.y*tile,(p.x+n.x)*.5*tile,(p.y+n.y)*.5*tile);
    }
    const last=points[points.length-1];
    ctx.lineTo(last.x*tile,last.y*tile);
  }
}
