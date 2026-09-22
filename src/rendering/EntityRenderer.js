import { FLUID_TYPES, dirAngle, heatCss, thermalState, waterCss } from './VisualTheme.js';

export class EntityRenderer {
  draw(ctx,world,tile,mode,time=0){
    for(const e of world.entities){
      const x=e.x*tile,y=e.y*tile,cx=x+tile/2,cy=y+tile/2;
      ctx.save();
      this.shadow(ctx,x,y,tile,e.type);
      if(e.type==='machine')this.machine(ctx,e,x,y,tile,time);
      else if(e.type==='serverRack')this.serverRack(ctx,e,x,y,tile,time);
      else if(e.type==='furnace')this.furnace(ctx,e,x,y,tile,time);
      else if(e.type==='passiveHeat')this.passiveHeat(ctx,e,x,y,tile,time);
      else if(e.type==='fan'||e.type==='exhaust')this.fan(ctx,e,cx,cy,tile,time);
      else if(FLUID_TYPES.has(e.type))this.fluid(ctx,world,e,x,y,tile,mode,time);
      else if(e.type==='sensor')this.sensor(ctx,e,cx,cy,tile,time);
      ctx.restore();
    }
  }

  shadow(ctx,x,y,tile,type){
    if(type==='pipe')return;
    ctx.fillStyle='rgba(0,0,0,.28)';
    ctx.fillRect(x+tile*.12,y+tile*.19,tile*.84,tile*.78);
  }

  machine(ctx,e,x,y,tile,time){
    const state=thermalState(e.temperature),pulse=.5+.5*Math.sin(time*5+e.id);
    if(state.glow){
      ctx.shadowColor=state.color;ctx.shadowBlur=tile*(.35+state.glow*.9*pulse);
    }
    const g=ctx.createLinearGradient(x,y,x+tile,y+tile);
    g.addColorStop(0,'#475569');g.addColorStop(.48,'#222b38');g.addColorStop(1,'#111827');
    ctx.fillStyle=g;ctx.fillRect(x+1,y+1,tile-2,tile-2);
    ctx.shadowBlur=0;
    ctx.strokeStyle=state.color;ctx.lineWidth=Math.max(1,tile*.08);ctx.strokeRect(x+1.5,y+1.5,tile-3,tile-3);
    ctx.fillStyle='#0b1220';ctx.fillRect(x+tile*.16,y+tile*.18,tile*.68,tile*.2);
    ctx.fillStyle=heatCss(e.temperature,.35+.45*state.glow);ctx.fillRect(x+tile*.2,y+tile*.22,tile*.6,tile*.1);
    ctx.strokeStyle='rgba(148,163,184,.45)';ctx.lineWidth=Math.max(.7,tile*.04);
    for(let i=0;i<4;i++){const gy=y+tile*(.52+i*.09);ctx.beginPath();ctx.moveTo(x+tile*.18,gy);ctx.lineTo(x+tile*.82,gy);ctx.stroke();}
    ctx.fillStyle=e.started?state.color:'#64748b';ctx.beginPath();ctx.arc(x+tile*.8,y+tile*.14,Math.max(1.2,tile*.06),0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f8fafc';ctx.font='700 '+Math.max(7,tile*.35)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(e.name.replace('Máquina ','M'),x+tile/2,y+tile*.42);
    if(e.temperature>=60){
      ctx.fillStyle=state.color;ctx.font='900 '+Math.max(8,tile*.42)+'px system-ui';ctx.fillText('!',x+tile*.18,y+tile*.15);
    }
  }


  serverRack(ctx,e,x,y,tile,time){
    const state=thermalState(e.temperature),pulse=.5+.5*Math.sin(time*4+e.id);
    ctx.fillStyle='#111827';ctx.strokeStyle=state.color;ctx.lineWidth=Math.max(1,tile*.055);
    ctx.fillRect(x+tile*.08,y+tile*.06,tile*.84,tile*.88);ctx.strokeRect(x+tile*.08,y+tile*.06,tile*.84,tile*.88);
    for(let i=0;i<5;i++){
      const ry=y+tile*(.16+i*.14);ctx.fillStyle=i%2?'#263244':'#1e293b';ctx.fillRect(x+tile*.16,ry,tile*.68,tile*.09);
      ctx.fillStyle=i<3?'#34d399':'#60a5fa';ctx.globalAlpha=.45+.45*pulse;ctx.fillRect(x+tile*.73,ry+tile*.02,tile*.05,tile*.035);ctx.globalAlpha=1;
    }
    const arrow=(d,color)=>{
      const cx=x+tile/2,cy=y+tile/2,ex=cx+d.x*tile*.48,ey=cy+d.y*tile*.48;
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,tile*.06);ctx.beginPath();ctx.moveTo(cx-d.x*tile*.18,cy-d.y*tile*.18);ctx.lineTo(ex,ey);ctx.stroke();
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(ex,ey,Math.max(1.2,tile*.055),0,Math.PI*2);ctx.fill();
    };
    arrow(e.airIntakeDirection,'#38bdf8');arrow(e.airExhaustDirection,'#fb923c');
  }

  furnace(ctx,e,x,y,tile,time){
    const pulse=.5+.5*Math.sin(time*2.2+e.id),g=ctx.createLinearGradient(x,y,x+tile,y+tile);
    g.addColorStop(0,'#4b1d12');g.addColorStop(.45,'#7c2d12');g.addColorStop(1,'#1f2937');
    ctx.fillStyle=g;ctx.strokeStyle='#f97316';ctx.lineWidth=Math.max(1,tile*.07);
    ctx.fillRect(x+tile*.04,y+tile*.04,tile*.92,tile*.92);ctx.strokeRect(x+tile*.04,y+tile*.04,tile*.92,tile*.92);
    ctx.fillStyle='rgba(251,146,60,'+(.38+pulse*.38)+')';ctx.fillRect(x+tile*.2,y+tile*.27,tile*.6,tile*.42);
    ctx.strokeStyle='#fed7aa';ctx.beginPath();ctx.arc(x+tile*.5,y+tile*.49,tile*.17,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#fff7ed';ctx.font='900 '+Math.max(7,tile*.3)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('F',x+tile/2,y+tile/2);
  }

  passiveHeat(ctx,e,x,y,tile,time){
    const cx=x+tile/2,cy=y+tile/2,pulse=.5+.5*Math.sin(time*3+e.id);
    ctx.fillStyle='rgba(245,158,11,'+(.28+pulse*.22)+')';ctx.beginPath();ctx.arc(cx,cy,tile*.24,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#fbbf24';ctx.lineWidth=Math.max(1,tile*.045);ctx.beginPath();ctx.arc(cx,cy,tile*.31,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#fde68a';ctx.font='800 '+Math.max(6,tile*.22)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e.icon==='computer'?'PC':'Q',cx,cy);
  }

  fan(ctx,e,cx,cy,tile,time){
    ctx.translate(cx,cy);ctx.rotate(dirAngle(e.direction));
    const exhaust=e.type==='exhaust',accent=exhaust?'#fb7185':'#67e8f9';
    ctx.fillStyle='#1f2937';ctx.strokeStyle='#64748b';ctx.lineWidth=Math.max(1,tile*.055);
    ctx.fillRect(-tile*.42,-tile*.42,tile*.84,tile*.84);ctx.strokeRect(-tile*.42,-tile*.42,tile*.84,tile*.84);
    ctx.strokeStyle=accent;ctx.strokeRect(-tile*.34,-tile*.34,tile*.68,tile*.68);
    ctx.save();ctx.rotate(time*(exhaust?-5.5:7.5));
    ctx.fillStyle=exhaust?'#be123c':'#0891b2';
    for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(tile*.3,-tile*.08,tile*.28,tile*.24);ctx.quadraticCurveTo(tile*.1,tile*.2,0,0);ctx.fill();}
    ctx.restore();
    ctx.fillStyle='#cbd5e1';ctx.beginPath();ctx.arc(0,0,tile*.08,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(203,213,225,.38)';ctx.beginPath();ctx.arc(0,0,tile*.3,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=accent;ctx.beginPath();
    if(exhaust){ctx.moveTo(-tile*.54,0);ctx.lineTo(-tile*.4,-tile*.12);ctx.lineTo(-tile*.4,tile*.12);}
    else {ctx.moveTo(tile*.56,0);ctx.lineTo(tile*.4,-tile*.12);ctx.lineTo(tile*.4,tile*.12);}
    ctx.closePath();ctx.fill();
  }

  fluid(ctx,world,e,x,y,tile,mode,time){
    if(e.type==='pipe')return this.pipe(ctx,world,e,x,y,tile,mode,time);
    if(e.type==='pump')return this.pump(ctx,world,e,x,y,tile,mode,time);
    if(e.type==='tank')return this.tank(ctx,world,e,x,y,tile,mode,time);
    if(e.type==='radiator')return this.radiator(ctx,world,e,x,y,tile,mode,time);
    if(e.type==='exchanger')return this.exchanger(ctx,world,e,x,y,tile,mode,time);
  }

  connections(world,e){
    return [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>{
      const n=world.entityAt(e.x+dx,e.y+dy);return n&&FLUID_TYPES.has(n.type);
    });
  }

  pipe(ctx,world,e,x,y,tile,mode,time){
    const cx=x+tile/2,cy=y+tile/2,neighbors=this.connections(world,e);
    const links=neighbors.length?neighbors:[[1,0],[-1,0]];
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const [dx,dy] of links){
      ctx.strokeStyle='#334155';ctx.lineWidth=tile*.34;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.55,cy+dy*tile*.55);ctx.stroke();
      ctx.strokeStyle=waterCss(e.waterTemperature,mode==='fluid'?1:.82);ctx.lineWidth=tile*.16;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.55,cy+dy*tile*.55);ctx.stroke();
      if(e.flowRate>.02){
        ctx.strokeStyle='rgba(224,242,254,.9)';ctx.lineWidth=Math.max(1,tile*.045);ctx.setLineDash([tile*.12,tile*.2]);ctx.lineDashOffset=-time*tile*(.9+e.flowRate*.25);
        ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.55,cy+dy*tile*.55);ctx.stroke();ctx.setLineDash([]);
      }
    }
    ctx.fillStyle=waterCss(e.waterTemperature,1);ctx.beginPath();ctx.arc(cx,cy,tile*.13,0,Math.PI*2);ctx.fill();
  }

  equipmentPorts(ctx,world,e,x,y,tile,mode,time){
    this.pipe(ctx,world,e,x,y,tile,mode,time);
  }

  pump(ctx,world,e,x,y,tile,mode,time){
    this.equipmentPorts(ctx,world,e,x,y,tile,mode,time);
    const cx=x+tile/2,cy=y+tile/2,pulse=.5+.5*Math.sin(time*6);
    ctx.fillStyle='#172033';ctx.strokeStyle='#38bdf8';ctx.lineWidth=Math.max(1,tile*.06);
    ctx.beginPath();ctx.arc(cx,cy,tile*.33,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(time*5);
    ctx.strokeStyle='rgba(186,230,253,'+(.55+pulse*.4)+')';ctx.lineWidth=Math.max(1,tile*.08);
    for(let i=0;i<3;i++){ctx.rotate(Math.PI*2/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(tile*.22,0);ctx.stroke();}
    ctx.restore();
    ctx.fillStyle='#e0f2fe';ctx.beginPath();ctx.arc(cx,cy,tile*.07,0,Math.PI*2);ctx.fill();
  }

  tank(ctx,world,e,x,y,tile,mode,time){
    this.equipmentPorts(ctx,world,e,x,y,tile,mode,time);
    const level=.72+Math.sin(time*.9+e.id)*.025;
    ctx.fillStyle='#1f2937';ctx.strokeStyle='#94a3b8';ctx.lineWidth=Math.max(1,tile*.055);
    ctx.fillRect(x+tile*.18,y+tile*.1,tile*.64,tile*.8);ctx.strokeRect(x+tile*.18,y+tile*.1,tile*.64,tile*.8);
    ctx.fillStyle=waterCss(e.waterTemperature,.82);ctx.fillRect(x+tile*.23,y+tile*(.82-level*.62),tile*.54,tile*level*.62);
    ctx.fillStyle='rgba(226,232,240,.16)';ctx.fillRect(x+tile*.27,y+tile*.16,tile*.08,tile*.58);
    ctx.strokeStyle='#cbd5e1';ctx.beginPath();ctx.moveTo(x+tile*.17,y+tile*.2);ctx.lineTo(x+tile*.83,y+tile*.2);ctx.stroke();
  }

  radiator(ctx,world,e,x,y,tile,mode,time){
    this.equipmentPorts(ctx,world,e,x,y,tile,mode,time);
    const hot=Math.max(0,Math.min(1,(e.waterTemperature-30)/40));
    ctx.fillStyle='#1f2937';ctx.strokeStyle=waterCss(e.waterTemperature,1);ctx.lineWidth=Math.max(1,tile*.06);
    ctx.fillRect(x+tile*.13,y+tile*.15,tile*.74,tile*.7);ctx.strokeRect(x+tile*.13,y+tile*.15,tile*.74,tile*.7);
    for(let i=0;i<5;i++){const fx=x+tile*(.22+i*.14);ctx.strokeStyle=heatCss(e.waterTemperature,.45+hot*.5);ctx.lineWidth=Math.max(1,tile*.055);ctx.beginPath();ctx.moveTo(fx,y+tile*.23);ctx.lineTo(fx,y+tile*.77);ctx.stroke();}
  }

  exchanger(ctx,world,e,x,y,tile,mode,time){
    this.equipmentPorts(ctx,world,e,x,y,tile,mode,time);
    ctx.fillStyle='#202938';ctx.strokeStyle=waterCss(e.waterTemperature,1);ctx.lineWidth=Math.max(1,tile*.06);
    ctx.fillRect(x+tile*.14,y+tile*.16,tile*.72,tile*.68);ctx.strokeRect(x+tile*.14,y+tile*.16,tile*.72,tile*.68);
    ctx.strokeStyle='#f59e0b';ctx.lineWidth=Math.max(1,tile*.055);
    for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x+tile*.25,y+tile*(.28+i*.18));ctx.lineTo(x+tile*.75,y+tile*(.28+i*.18));ctx.stroke();}
    ctx.fillStyle='#e2e8f0';ctx.font='800 '+Math.max(7,tile*.36)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('HX',x+tile/2,y+tile/2);
  }

  sensor(ctx,e,cx,cy,tile,time){
    const state=thermalState(e.current),pulse=.55+.45*Math.sin(time*3+e.id);
    ctx.fillStyle='#111827';ctx.strokeStyle=state.color;ctx.lineWidth=Math.max(1,tile*.06);
    ctx.beginPath();ctx.arc(cx,cy,tile*.31,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=state.color;ctx.beginPath();ctx.arc(cx,cy,tile*.09*(.9+pulse*.18),0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f8fafc';ctx.font='700 '+Math.max(6,tile*.25)+'px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(Math.round(e.current)+'°',cx,cy+tile*.48);
  }
}
