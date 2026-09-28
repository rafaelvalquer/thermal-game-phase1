const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const palette={
  hot:{start:'rgba(251,146,60,',end:'rgba(56,189,248,',arrow:'rgba(251,146,60,'},
  cold:{start:'rgba(103,232,249,',end:'rgba(56,189,248,',arrow:'rgba(103,232,249,'},
  exhaust:{start:'rgba(167,139,250,',end:'rgba(56,189,248,',arrow:'rgba(196,181,253,'},
  ambient:{start:'rgba(56,189,248,',end:'rgba(56,189,248,',arrow:'rgba(186,230,253,'},
};

// Ramer–Douglas–Peucker: keep bends while discarding collinear integration steps.
// Physics samples remain intact; this only reduces drawing commands.
export function simplifyStreamline(points,tolerance=.025){
  if(points.length<3)return points;
  const keep=new Uint8Array(points.length),stack=[[0,points.length-1]],limit=tolerance*tolerance;keep[0]=keep[points.length-1]=1;
  while(stack.length){const [start,end]=stack.pop(),a=points[start],b=points[end],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;let far=-1,max=limit;
    for(let i=start+1;i<end;i++){const p=points[i],t=length?clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0,1):0,x=p.x-a.x-t*dx,y=p.y-a.y-t*dy,d=x*x+y*y;if(d>max){max=d;far=i;}}
    if(far>=0){keep[far]=1;stack.push([start,far],[far,end]);}
  }return points.filter((_,index)=>keep[index]);
}

export class StreamlineRenderer {
  constructor(){this.geometry=new WeakMap();}
  geometryFor(line,tile){
    let cached=this.geometry.get(line);if(cached?.tile===tile)return cached;
    const points=simplifyStreamline(line.points),path=typeof Path2D==='undefined'?null:new Path2D();
    if(path)this.trace(path,points,tile);
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    cached={tile,points,path,minX:Math.min(...xs)*tile,maxX:Math.max(...xs)*tile,minY:Math.min(...ys)*tile,maxY:Math.max(...ys)*tile};
    this.geometry.set(line,cached);return cached;
  }
  draw(ctx,lines,tile,time=0,zoom=1,bounds=null){
    ctx.save();
    ctx.lineCap='round';ctx.lineJoin='round';

    for(let li=0;li<lines.length;li++){
      const line=lines[li];
      if(line.points.length<3)continue;
      const geometry=this.geometryFor(line,tile);
      if(bounds&&(geometry.maxX<bounds.x-tile||geometry.minX>bounds.x+bounds.width+tile||geometry.maxY<bounds.y-tile||geometry.minY>bounds.y+bounds.height+tile))continue;
      const speed=Math.max(.05,line.averageSpeed||0);
      const alpha=clamp(.17+speed*.095,.18,.72);
      const width=clamp((.7+speed*.12)*clamp(.85+zoom*.15,.75,1.5),.65,2.5);

      const colors=palette[line.sourceType]||palette.ambient;
      const first=line.points[0],last=line.points[line.points.length-1];
      const gradient=ctx.createLinearGradient(first.x*tile,first.y*tile,last.x*tile,last.y*tile);
      gradient.addColorStop(0,colors.start+alpha+')');
      gradient.addColorStop(1,colors.end+Math.max(.08,alpha*.3)+')');
      ctx.strokeStyle=gradient;
      ctx.lineWidth=width;
      if(geometry.path)ctx.stroke(geometry.path);
      else{ctx.beginPath();this.trace(ctx,geometry.points,tile);ctx.stroke();}

      ctx.strokeStyle='rgba(224,242,254,'+clamp(alpha+.16,.2,.9)+')';
      ctx.lineWidth=Math.max(.8,width*.72);
      ctx.setLineDash([tile*.42,tile*.72]);
      ctx.lineDashOffset=-(time*(tile*(.65+speed*.58))+li*tile*.17);
      if(geometry.path)ctx.stroke(geometry.path);
      else{ctx.beginPath();this.trace(ctx,geometry.points,tile);ctx.stroke();}
      ctx.setLineDash([]);

      this.drawDirection(ctx,line.points,tile,colors.arrow,alpha,zoom);

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

  drawDirection(ctx,points,tile,color,alpha,zoom){
    if(points.length<4)return;
    const index=Math.min(points.length-2,Math.max(1,Math.floor(points.length*.68)));
    const before=points[index-1],at=points[index],after=points[index+1];
    const dx=after.x-before.x,dy=after.y-before.y,length=Math.hypot(dx,dy);
    if(length<1e-5)return;
    const angle=Math.atan2(dy,dx),size=Math.max(2.5,tile*.19*clamp(.8+zoom*.2,.7,1.4));
    ctx.save();ctx.translate(at.x*tile,at.y*tile);ctx.rotate(angle);
    ctx.fillStyle=color+clamp(alpha+.1,.25,.92)+')';
    ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.75,-size*.65);ctx.lineTo(-size*.45,0);ctx.lineTo(-size*.75,size*.65);ctx.closePath();ctx.fill();
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
