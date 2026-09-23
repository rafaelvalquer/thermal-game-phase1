import { FLUID_TYPES, dirAngle, heatCss, thermalState, waterCss } from './VisualTheme.js';
import { EquipmentSpriteRenderer } from './sprites/EquipmentSpriteRenderer.js';

export class EntityRenderer {
  constructor(){this.sprites=new EquipmentSpriteRenderer();}

  draw(ctx,world,tile,mode,time=0){
    const ordered=[...world.entities].map((entity,index)=>({entity,index})).sort((a,b)=>(a.entity.y+this.sprites.visualFootY(a.entity))*tile-(b.entity.y+this.sprites.visualFootY(b.entity))*tile||a.index-b.index);
    for(const {entity:e} of ordered){
      if(this.sprites.draw(ctx,world,e,tile,mode,time))continue;
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
      else if(['airHandler','condenser','supplyVent','returnVent','ductDamper'].includes(e.type))this.hvacDevice(ctx,e,x,y,tile,time);
      ctx.restore();
    }
  }

  drawPreview(ctx,world,tool,x,y,direction,tile,mode,time=0,valid=true){
    const types={fan:'fan',exhaust:'exhaust',pipe:'pipe',pump:'pump',tank:'tank',radiator:'radiator',exchanger:'exchanger',sensor:'sensor',airHandler:'airHandler',condenser:'condenser',supplyVent:'supplyVent',returnVent:'returnVent',ductDamper:'ductDamper'};
    if(!types[tool])return false;
    const entity={id:987654,type:types[tool],x,y,direction:{...direction},enabled:true,started:true,currentVelocity:.35,currentFlow:.15,
      circuitClosed:false,flowRate:0,waterTemperature:25,inletTemperature:25,outletTemperature:25,thermalPower:0,
      airInTemperature:25,airOutTemperature:25,fanBoost:1,resistance:1,hydraulicPower:36,current:25,average:25,max:25,
      name:'Prévia',temperature:25};
    ctx.save();ctx.globalAlpha=valid?.58:.38;
    const previewWorld={...world,entities:[entity],entityAt:(tx,ty)=>world.entityAt(tx,ty)};
    if(!this.sprites.draw(ctx,previewWorld,entity,tile,mode,time,{preview:true,valid}))this.drawProcedural(ctx,previewWorld,entity,tile,mode,time);
    ctx.restore();
    return true;
  }

  drawProcedural(ctx,world,e,tile,mode,time){
    return this.draw(ctx,{...world,entities:[e]},tile,mode,time);
  }

  shadow(ctx,x,y,tile,type){
    if(type==='pipe'||['smallDuct','mediumDuct','largeDuct','damper'].includes(type))return;
    const g=ctx.createRadialGradient(x+tile*.5,y+tile*.64,tile*.1,x+tile*.5,y+tile*.64,tile*.58);
    g.addColorStop(0,'rgba(0,0,0,.38)');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x+tile*.5,y+tile*.7,tile*.62,tile*.4,0,0,Math.PI*2);ctx.fill();
  }

  hvacDevice(ctx,e,x,y,tile,time){
    const cx=x+tile/2,cy=y+tile/2;
    if(e.type==='airHandler'||e.type==='condenser'){
      const condenser=e.type==='condenser',color=condenser?'#fb923c':'#38bdf8';
      const g=ctx.createLinearGradient(x,y,x+tile,y+tile);g.addColorStop(0,'#475569');g.addColorStop(1,'#0f172a');
      ctx.fillStyle=g;ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,tile*.07);ctx.fillRect(x+tile*.08,y+tile*.12,tile*.84,tile*.76);ctx.strokeRect(x+tile*.08,y+tile*.12,tile*.84,tile*.76);
      ctx.fillStyle='#020617';ctx.fillRect(x+tile*.18,y+tile*.25,tile*.64,tile*.4);
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(.7,tile*.035);
      for(let i=0;i<5;i++){const xx=x+tile*(.24+i*.13);ctx.beginPath();ctx.moveTo(xx,y+tile*.28);ctx.lineTo(xx,y+tile*.61);ctx.stroke();}
      const active=condenser?e.heatRejected>0:e.currentFlow>0,statusColor=e.status==='HIGH HEAD'?'#fb7185':active?'#4ade80':'#fbbf24';
      ctx.fillStyle=statusColor;ctx.beginPath();ctx.arc(x+tile*.77,y+tile*.76,tile*.055,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.translate(cx,cy);if(active&&time>0)ctx.rotate(time*(condenser?2.4:1.8));
      ctx.strokeStyle=color;ctx.beginPath();ctx.arc(0,0,tile*.13,0,Math.PI*2);
      for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.moveTo(0,0);ctx.lineTo(tile*.12,0);}ctx.stroke();ctx.restore();
      return;
    }
    if(e.type==='supplyVent'||e.type==='returnVent'){
      const supply=e.type==='supplyVent',d=e.direction||{x:0,y:supply?1:-1};ctx.fillStyle='#0f172a';ctx.strokeStyle=supply?'#38bdf8':'#f59e0b';ctx.lineWidth=Math.max(1,tile*.06);ctx.fillRect(x+tile*.13,y+tile*.13,tile*.74,tile*.74);ctx.strokeRect(x+tile*.13,y+tile*.13,tile*.74,tile*.74);
      for(let i=0;i<4;i++){const f=(i+1)/5,xx=x+tile*(.2+f*.6),yy=y+tile*(.2+f*.6);ctx.beginPath();if(Math.abs(d.x)>0){ctx.moveTo(xx,y+tile*.24);ctx.lineTo(xx,y+tile*.76);}else{ctx.moveTo(x+tile*.24,yy);ctx.lineTo(x+tile*.76,yy);}ctx.stroke();}
      return;
    }
    if(e.type==='ductDamper'){
      ctx.fillStyle='#172033';ctx.strokeStyle='#a78bfa';ctx.lineWidth=Math.max(1,tile*.05);ctx.fillRect(x+tile*.2,y+tile*.2,tile*.6,tile*.6);ctx.strokeRect(x+tile*.2,y+tile*.2,tile*.6,tile*.6);
      ctx.save();ctx.translate(cx,cy);ctx.rotate((1-e.opening)*Math.PI/2);ctx.beginPath();ctx.moveTo(-tile*.2,0);ctx.lineTo(tile*.2,0);ctx.stroke();ctx.restore();
    }
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
    const flow=Math.max(0,e.currentVelocity||0),rotorSpeed=flow>0.04?.6+flow*2.2:0;
    ctx.save();if(rotorSpeed)ctx.rotate(time*(exhaust?-rotorSpeed:rotorSpeed));
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
    }
    ctx.fillStyle=waterCss(e.waterTemperature,1);ctx.beginPath();ctx.arc(cx,cy,tile*.13,0,Math.PI*2);ctx.fill();
  }

  equipmentPorts(ctx,world,e,x,y,tile,mode,time){
    this.pipe(ctx,world,e,x,y,tile,mode,time);
  }

  pump(ctx,world,e,x,y,tile,mode,time){
    this.equipmentPorts(ctx,world,e,x,y,tile,mode,time);
    const cx=x+tile/2,cy=y+tile/2,pulse=.5+.5*Math.sin(time*6);
    const ok=e.circuitClosed&&e.flowRate>.02;
    ctx.fillStyle='#172033';ctx.strokeStyle=ok?'#38bdf8':'#f59e0b';ctx.lineWidth=Math.max(1,tile*.06);
    ctx.beginPath();ctx.arc(cx,cy,tile*.33,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.save();ctx.translate(cx,cy);if(ok)ctx.rotate(time*5);
    ctx.strokeStyle=ok?'rgba(186,230,253,'+(.55+pulse*.4)+')':'rgba(245,158,11,.6)';
    ctx.lineWidth=Math.max(1,tile*.08);
    for(let i=0;i<3;i++){ctx.rotate(Math.PI*2/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(tile*.22,0);ctx.stroke();}
    ctx.restore();
    ctx.fillStyle='#e0f2fe';ctx.beginPath();ctx.arc(cx,cy,tile*.07,0,Math.PI*2);ctx.fill();

    const d=e.direction||{x:1,y:0};
    const ex=cx+d.x*tile*.48,ey=cy+d.y*tile*.48,side=tile*.1;
    ctx.strokeStyle=ok?'#7dd3fc':'#fbbf24';ctx.lineWidth=Math.max(1,tile*.055);
    ctx.beginPath();ctx.moveTo(cx+d.x*tile*.15,cy+d.y*tile*.15);ctx.lineTo(ex,ey);ctx.stroke();
    ctx.fillStyle=ok?'#7dd3fc':'#fbbf24';
    ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-d.x*tile*.16-d.y*side,ey-d.y*tile*.16+d.x*side);ctx.lineTo(ex-d.x*tile*.16+d.y*side,ey-d.y*tile*.16-d.x*side);ctx.closePath();ctx.fill();
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
    const hot=Math.max(0,Math.min(1,(e.waterTemperature-28)/35));
    if((e.thermalPower||0)>100){
      ctx.shadowColor=heatCss(e.waterTemperature,.8);
      ctx.shadowBlur=tile*(.18+hot*.45);
    }
    ctx.fillStyle='#1f2937';ctx.strokeStyle=waterCss(e.waterTemperature,1);ctx.lineWidth=Math.max(1,tile*.06);
    ctx.fillRect(x+tile*.13,y+tile*.15,tile*.74,tile*.7);ctx.strokeRect(x+tile*.13,y+tile*.15,tile*.74,tile*.7);
    ctx.shadowBlur=0;
    for(let i=0;i<5;i++){
      const fx=x+tile*(.22+i*.14);
      ctx.strokeStyle=heatCss(e.waterTemperature,.38+hot*.58);ctx.lineWidth=Math.max(1,tile*.055);
      ctx.beginPath();ctx.moveTo(fx,y+tile*.23);ctx.lineTo(fx,y+tile*.77);ctx.stroke();
    }
  }

  exchanger(ctx,world,e,x,y,tile,mode,time){
    this.equipmentPorts(ctx,world,e,x,y,tile,mode,time);
    const active=e.circuitClosed&&Math.abs(e.thermalPower||0)>50;
    ctx.fillStyle='#202938';ctx.strokeStyle=active?'#f59e0b':waterCss(e.waterTemperature,1);ctx.lineWidth=Math.max(1,tile*.06);
    ctx.fillRect(x+tile*.14,y+tile*.16,tile*.72,tile*.68);ctx.strokeRect(x+tile*.14,y+tile*.16,tile*.72,tile*.68);
    ctx.strokeStyle=active?'#fb923c':'#64748b';ctx.lineWidth=Math.max(1,tile*.055);
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
