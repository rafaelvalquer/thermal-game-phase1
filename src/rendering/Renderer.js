import { TileRenderer } from './TileRenderer.js';
import { HeatmapRenderer } from './HeatmapRenderer.js';
import { AirflowRenderer } from './AirflowRenderer.js';
import { EntityRenderer } from './EntityRenderer.js';
import { EffectsRenderer } from './EffectsRenderer.js';
import { FLUID_TYPES, waterCss } from './VisualTheme.js';

export class Renderer {
  constructor(canvas,camera,{tilePixels=14}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.camera=camera;this.tile=tilePixels;
    this.mode='normal';this.debug=false;this.hover=null;this.buildSystem=null;this.selectedEntity=null;
    this.tileRenderer=new TileRenderer();this.heatmap=new HeatmapRenderer();this.airflow=new AirflowRenderer();
    this.entities=new EntityRenderer();this.effects=new EffectsRenderer();
  }

  resize(){
    const dpr=Math.min(2,devicePixelRatio||1),r=this.canvas.getBoundingClientRect(),w=Math.max(1,Math.floor(r.width*dpr)),h=Math.max(1,Math.floor(r.height*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.dpr=dpr;
  }

  draw(world,simulation){
    this.resize();const ctx=this.ctx,time=performance.now()/1000;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.canvas.width/this.dpr,this.canvas.height/this.dpr);
    const bg=ctx.createLinearGradient(0,0,0,this.canvas.height/this.dpr);bg.addColorStop(0,'#07111f');bg.addColorStop(1,'#020617');ctx.fillStyle=bg;ctx.fillRect(0,0,this.canvas.width/this.dpr,this.canvas.height/this.dpr);
    ctx.save();ctx.scale(this.camera.zoom,this.camera.zoom);ctx.translate(-this.camera.x,-this.camera.y);
    this.tileRenderer.draw(ctx,world,this.tile);
    this.drawZones(ctx);
    if(this.mode==='thermal')this.heatmap.draw(ctx,world,this.tile);
    if(this.mode==='fluid')this.drawFluidNetwork(ctx,world,time);
    this.entities.draw(ctx,world,this.tile,this.mode,time);
    this.effects.draw(ctx,world,this.tile,this.mode,time);
    if(this.mode==='airflow')this.airflow.draw(ctx,world,this.tile,time);
    this.drawSelection(ctx);this.drawHover(ctx,world,time);
    if(this.debug)this.drawDebug(ctx,world);
    ctx.restore();this.drawLegend(ctx,simulation);
  }

  drawZones(ctx){
    if(!this.zones?.length)return;
    ctx.save();ctx.font='700 '+Math.max(7,this.tile*.34)+'px system-ui';ctx.textBaseline='top';
    for(const z of this.zones){const x=z.x*this.tile,y=z.y*this.tile,w=z.width*this.tile,h=z.height*this.tile;ctx.strokeStyle='rgba(56,189,248,.16)';ctx.lineWidth=Math.max(.7,1/this.camera.zoom);ctx.setLineDash([this.tile*.24,this.tile*.18]);ctx.strokeRect(x+.5,y+.5,w-1,h-1);ctx.setLineDash([]);ctx.fillStyle='rgba(2,6,23,.68)';const label=(z.name||z.id)+(z.target?' · < '+z.target+'°C':'');const mw=ctx.measureText(label).width+8;ctx.fillRect(x+3,y+3,mw,Math.max(12,this.tile*.58));ctx.fillStyle='#7dd3fc';ctx.fillText(label,x+7,y+5);}
    ctx.restore();
  }

  drawFluidNetwork(ctx,world,time){
    const fluid=world.entities.filter(e=>FLUID_TYPES.has(e.type));
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';

    for(const a of fluid)for(const b of fluid){
      if(a.id>=b.id||Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)continue;
      const ax=(a.x+.5)*this.tile,ay=(a.y+.5)*this.tile,bx=(b.x+.5)*this.tile,by=(b.y+.5)*this.tile;
      const valid=a.circuitClosed&&b.circuitClosed&&a.networkId===b.networkId;
      const t=((a.waterTemperature||25)+(b.waterTemperature||25))/2;

      ctx.strokeStyle=valid?'rgba(15,23,42,.9)':'rgba(69,26,3,.88)';
      ctx.lineWidth=this.tile*.45;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
      ctx.strokeStyle=valid?waterCss(t,.95):'rgba(245,158,11,.65)';
      ctx.lineWidth=this.tile*.22;ctx.stroke();

      let from=null,to=null;
      if(a.downstreamId===b.id){from=a;to=b;}
      else if(b.downstreamId===a.id){from=b;to=a;}

      if(valid&&from&&from.flowRate>.02){
        const phase=(time*(.72+from.flowRate*.2)+from.id*.137)%1;
        const fx=(from.x+.5)*this.tile,fy=(from.y+.5)*this.tile,tx=(to.x+.5)*this.tile,ty=(to.y+.5)*this.tile;
        const px=fx+(tx-fx)*phase,py=fy+(ty-fy)*phase;
        const angle=Math.atan2(ty-fy,tx-fx),size=Math.max(2,this.tile*.12);
        ctx.fillStyle='rgba(240,249,255,.96)';
        ctx.save();ctx.translate(px,py);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.7,-size*.55);ctx.lineTo(-size*.7,size*.55);ctx.closePath();ctx.fill();ctx.restore();
      }
    }
    ctx.restore();
  }

  drawSelection(ctx){
    const e=this.selectedEntity;if(!e)return;
    const x=e.x*this.tile,y=e.y*this.tile,pulse=.5+.5*Math.sin(performance.now()/180);
    ctx.save();ctx.strokeStyle='rgba(250,204,21,'+(.55+pulse*.35)+')';ctx.lineWidth=Math.max(1.2,2/this.camera.zoom);
    ctx.setLineDash([this.tile*.18,this.tile*.12]);ctx.strokeRect(x-this.tile*.12,y-this.tile*.12,this.tile*1.24,this.tile*1.24);ctx.setLineDash([]);ctx.restore();
  }

  drawHover(ctx,world,time){
    if(!this.hover||!world.inBounds(this.hover.x,this.hover.y))return;
    const x=this.hover.x,y=this.hover.y,selected=this.buildSystem?.selected;
    const valid=selected?this.buildSystem.validator.canPlace(selected,x,y):true,pulse=.5+.5*Math.sin(time*5);
    ctx.save();ctx.fillStyle=selected?(valid?'rgba(34,197,94,.09)':'rgba(239,68,68,.12)'):'rgba(248,250,252,.025)';
    ctx.fillRect(x*this.tile,y*this.tile,this.tile,this.tile);
    ctx.strokeStyle=selected?(valid?'#4ade80':'#f87171'):'#f8fafc';ctx.globalAlpha=.72+pulse*.25;ctx.lineWidth=Math.max(1,2/this.camera.zoom);ctx.strokeRect(x*this.tile+1,y*this.tile+1,this.tile-2,this.tile-2);ctx.globalAlpha=1;
    if(selected&&['fan','exhaust','pump'].includes(selected)){
      const d=this.buildSystem.direction(),cx=(x+.5)*this.tile,cy=(y+.5)*this.tile;
      const distance=selected==='pump'?this.tile*1.4:this.tile*4;
      const spread=selected==='pump'?this.tile*.28:this.tile*.9;
      ctx.fillStyle='rgba(14,165,233,.07)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+d.x*distance-d.y*spread,cy+d.y*distance+d.x*spread);ctx.lineTo(cx+d.x*distance+d.y*spread,cy+d.y*distance-d.x*spread);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#7dd3fc';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+d.x*(distance*.85),cy+d.y*(distance*.85));ctx.stroke();
    }
    ctx.restore();
  }

  drawDebug(ctx,world){
    if(!this.hover||!world.inBounds(this.hover.x,this.hover.y))return;
    const t=world.tileMap.get(this.hover.x,this.hover.y),txt=['('+t.x+','+t.y+')',t.material.name,t.temperature.toFixed(2)+'°C','E '+(t.thermalEnergy/1000).toFixed(1)+' kJ','air '+t.airflowX.toFixed(2)+', '+t.airflowY.toFixed(2)];
    ctx.font='10px ui-monospace,monospace';const x=t.x*this.tile+this.tile+4,y=t.y*this.tile;
    ctx.fillStyle='rgba(2,6,23,.94)';ctx.fillRect(x,y,138,txt.length*13+8);ctx.strokeStyle='#334155';ctx.strokeRect(x+.5,y+.5,137,txt.length*13+7);
    ctx.fillStyle='#e2e8f0';txt.forEach((s,i)=>ctx.fillText(s,x+5,y+14+i*13));
  }

  drawLegend(ctx){
    const configs={
      thermal:{title:'TEMPERATURA',left:'10°C',right:'80°C+',colors:['#1450dc','#22d3ee','#28c85a','#facc15','#f97316','#e62323']},
      airflow:{title:'FLUXO DE AR',left:'baixo',right:'alto',colors:['#0f2742','#0ea5e9','#bae6fd']},
      fluid:{title:'ÁGUA / REDE',left:'fria',right:'quente',colors:['#2563eb','#22d3ee','#2dd4bf','#facc15','#f97316']},
    };
    const c=configs[this.mode];if(!c)return;
    const x=18,y=18,w=168,h=10,g=ctx.createLinearGradient(x,y,x+w,y);
    c.colors.forEach((color,i)=>g.addColorStop(i/(c.colors.length-1),color));
    ctx.fillStyle='rgba(2,6,23,.88)';ctx.fillRect(x-9,y-11,w+18,50);ctx.strokeStyle='rgba(100,116,139,.55)';ctx.strokeRect(x-8.5,y-10.5,w+17,49);
    ctx.fillStyle='#94a3b8';ctx.font='800 9px system-ui';ctx.fillText(c.title,x,y-2);
    ctx.fillStyle=g;ctx.fillRect(x,y+5,w,h);
    ctx.fillStyle='#cbd5e1';ctx.font='10px system-ui';ctx.fillText(c.left,x,y+31);ctx.fillText(c.right,x+w-ctx.measureText(c.right).width,y+31);
  }
}
