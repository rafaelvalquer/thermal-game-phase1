import { FLUID_TYPES, heatCss, thermalState } from './VisualTheme.js';

export class EffectsRenderer {
  draw(ctx,world,tile,mode,time){
    this.thermalEffects(ctx,world,tile,time);
    if(mode==='normal')this.ambientAir(ctx,world,tile,time);
    this.exhaustEffects(ctx,world,tile,time);
    this.exchangerLinks(ctx,world,tile,time);
  }

  thermalEffects(ctx,world,tile,time){
    ctx.save();ctx.lineCap='round';
    for(const e of world.entities){
      const temp=e.isHeatMachine?e.temperature:(FLUID_TYPES.has(e.type)?e.waterTemperature:null);
      if(temp==null||temp<42)continue;
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
      if(e.type!=='fan')continue;
      const d=e.direction,cx=(e.x+.5)*tile,cy=(e.y+.5)*tile;
      for(let k=0;k<4;k++){
        const phase=(time*(1.2+k*.09)+k*.23)%1;
        const along=tile*(.65+phase*3.2),side=(k-1.5)*tile*.18;
        const px=cx+d.x*along-d.y*side,py=cy+d.y*along+d.x*side;
        ctx.strokeStyle='rgba(125,211,252,'+(0.11+(1-phase)*.18)+')';
        ctx.lineWidth=Math.max(.7,tile*.04);ctx.beginPath();ctx.moveTo(px-d.x*tile*.36,py-d.y*tile*.36);ctx.lineTo(px+d.x*tile*.15,py+d.y*tile*.15);ctx.stroke();
      }
    }
    ctx.restore();
  }

  exhaustEffects(ctx,world,tile,time){
    ctx.save();ctx.lineCap='round';
    for(const e of world.entities){
      if(e.type!=='exhaust')continue;
      const d=e.direction,cx=(e.x+.5)*tile,cy=(e.y+.5)*tile;
      for(let k=0;k<5;k++){
        const phase=(time*(.9+k*.04)+k*.17)%1;
        const distance=tile*(.45+(1-phase)*2.2),side=(k-2)*tile*.18*(.35+phase);
        const px=cx-d.x*distance-d.y*side,py=cy-d.y*distance+d.x*side;
        ctx.fillStyle='rgba(251,113,133,'+(.08+phase*.3)+')';
        ctx.beginPath();ctx.arc(px,py,Math.max(1,tile*.045*(.7+phase)),0,Math.PI*2);ctx.fill();
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
        if(m.type!=='machine')continue;
        const dist=Math.abs(m.x-e.x)+Math.abs(m.y-e.y);
        if(dist<best&&dist<=1){best=dist;machine=m;}
      }
      if(!machine)continue;
      const delta=machine.temperature-e.waterTemperature;
      if(Math.abs(delta)<2)continue;
      ctx.strokeStyle=delta>0?'rgba(251,146,60,.72)':'rgba(56,189,248,.7)';
      ctx.lineWidth=Math.max(1,tile*.055);ctx.setLineDash([tile*.14,tile*.12]);ctx.lineDashOffset=-time*tile*.8;
      ctx.beginPath();ctx.moveTo((e.x+.5)*tile,(e.y+.5)*tile);ctx.lineTo((machine.x+.5)*tile,(machine.y+.5)*tile);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.restore();
  }
}
