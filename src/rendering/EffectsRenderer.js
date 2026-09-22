import { FLUID_TYPES, heatCss, thermalState } from './VisualTheme.js';

export class EffectsRenderer {
  draw(ctx,world,tile,mode,time){
    this.thermalEffects(ctx,world,tile,time);
    if(mode==='normal')this.ambientAir(ctx,world,tile,time);
    this.exhaustEffects(ctx,world,tile,time);
    this.radiatorHeat(ctx,world,tile,time);
    this.exchangerLinks(ctx,world,tile,time);
  }

  thermalEffects(ctx,world,tile,time){
    ctx.save();ctx.lineCap='round';
    for(const e of world.entities){
      const temp=e.isHeatMachine?e.temperature:(FLUID_TYPES.has(e.type)?e.waterTemperature:null);
      const threshold=e.type==='radiator'?30:42;
      if(temp==null||temp<threshold)continue;
      const state=thermalState(temp),cx=(e.x+.5)*tile,cy=(e.y+.3)*tile;
      const strength=Math.min(1,(temp-40)/45);
      ctx.strokeStyle=heatCss(temp,.18+.28*strength);ctx.lineWidth=Math.max(.8,tile*.045);
      for(let k=0;k<3;k++){
        const phase=time*1.8+k*1.7+e.id*.31;
        const sx=cx+(k-1)*tile*.19,base=cy-tile*.18;
        ctx.beginPath();
        for(let p=0;p<=6;p++){
          const yy=base-p*tile*.13,xx=sx+Math.sin(phase+p*.8)*tile*.08*(.35+strength);
          p?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);
        }
        ctx.stroke();
      }
      if(e.isHeatMachine&&e.type!=='furnace'&&temp>=60){
        const pulse=.55+.45*Math.sin(time*5+e.id);
        ctx.fillStyle=state.color;ctx.globalAlpha=.55+.35*pulse;
        ctx.beginPath();ctx.arc(cx,cy-tile*.72,tile*.17*(1+pulse*.12),0,Math.PI*2);ctx.fill();
        ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.font='900 '+Math.max(7,tile*.24)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',cx,cy-tile*.72);
      }
    }
    ctx.restore();
  }

  ambientAir(ctx,world,tile,time){
    ctx.save();ctx.lineCap='round';
    for(const e of world.entities){
      if(e.type!=='fan'||(e.currentVelocity||0)<.08)continue;
      const d=e.direction,cx=(e.x+.5)*tile,cy=(e.y+.5)*tile;
      const speed=e.currentVelocity||0;
      for(let k=0;k<3;k++){
        const phase=(time*(.7+speed*.18)+k*.29)%1;
        const along=tile*(.55+phase*(.8+Math.min(2.2,speed*.65)));
        const side=(k-1)*tile*.13*(.5+phase);
        const px=cx+d.x*along-d.y*side,py=cy+d.y*along+d.x*side;
        ctx.strokeStyle='rgba(125,211,252,'+(.08+Math.min(.26,speed*.055)) +')';
        ctx.lineWidth=Math.max(.7,tile*.035);ctx.beginPath();
        ctx.moveTo(px-d.x*tile*.22,py-d.y*tile*.22);ctx.lineTo(px+d.x*tile*.1,py+d.y*tile*.1);ctx.stroke();
      }
    }
    ctx.restore();
  }

  exhaustEffects(ctx,world,tile,time){
    ctx.save();ctx.lineCap='round';
    for(const e of world.entities){
      if(e.type!=='exhaust'||(e.currentFlow||0)<.02)continue;
      const d=e.direction,cx=(e.x+.5)*tile,cy=(e.y+.5)*tile,speed=e.currentVelocity||0;
      for(let k=0;k<4;k++){
        const phase=(time*(.6+speed*.14)+k*.19)%1;
        const distance=tile*(.4+(1-phase)*(1+Math.min(1.5,speed*.4))),side=(k-1.5)*tile*.14*(.35+phase);
        const px=cx-d.x*distance-d.y*side,py=cy-d.y*distance+d.x*side;
        ctx.fillStyle='rgba(251,113,133,'+(.08+phase*Math.min(.28,.08+speed*.04))+')';
        ctx.beginPath();ctx.arc(px,py,Math.max(1,tile*.04*(.7+phase)),0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }

  radiatorHeat(ctx,world,tile,time){
    ctx.save();ctx.lineCap='round';
    for(const r of world.entities){
      if(r.type!=='radiator'||Math.abs(r.thermalPower||0)<100||r.waterTemperature<=r.airInTemperature)continue;
      const strength=Math.min(1,Math.abs(r.thermalPower)/25000),cx=(r.x+.5)*tile,cy=(r.y+.5)*tile;
      ctx.strokeStyle='rgba(251,146,60,'+(.18+strength*.35)+')';
      ctx.lineWidth=Math.max(.8,tile*.045);
      for(let k=0;k<4;k++){
        const phase=time*1.5+k*.9+r.id*.13;
        const angle=(Math.PI*2*k/4)+Math.sin(phase)*.15;
        const len=tile*(.55+strength*.8);
        const sx=cx+Math.cos(angle)*tile*.2,sy=cy+Math.sin(angle)*tile*.2;
        const ex=sx+Math.cos(angle)*len,ey=sy+Math.sin(angle)*len;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo((sx+ex)/2+Math.sin(phase)*tile*.12,(sy+ey)/2+Math.cos(phase)*tile*.12,ex,ey);ctx.stroke();
      }
    }
    ctx.restore();
  }

  exchangerLinks(ctx,world,tile,time){
    ctx.save();
    for(const e of world.entities){
      if(e.type!=='exchanger')continue;
      let machine=null,best=Infinity;
      for(const m of world.entities){
        if(!m.isHeatMachine)continue;
        const dist=Math.abs(m.x-e.x)+Math.abs(m.y-e.y);
        if(dist<best&&dist<=1){best=dist;machine=m;}
      }
      if(!machine||!e.circuitClosed||Math.abs(e.thermalPower||0)<50)continue;
      const delta=machine.temperature-e.waterTemperature;
      if(Math.abs(delta)<2)continue;
      ctx.strokeStyle=delta>0?'rgba(251,146,60,.72)':'rgba(56,189,248,.7)';
      ctx.lineWidth=Math.max(1,tile*.055);ctx.setLineDash([tile*.14,tile*.12]);ctx.lineDashOffset=-time*tile*.8;
      ctx.beginPath();ctx.moveTo((e.x+.5)*tile,(e.y+.5)*tile);ctx.lineTo((machine.x+.5)*tile,(machine.y+.5)*tile);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.restore();
  }
}
