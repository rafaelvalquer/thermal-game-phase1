import { thermalLegendPosition } from './thermal/ThermalPalette.js';
import { TileRenderer } from './TileRenderer.js';
import { HeatmapRenderer } from './HeatmapRenderer.js';
import { AirflowRenderer } from './AirflowRenderer.js';
import { PressureRenderer } from './PressureRenderer.js';
import { EntityRenderer } from './EntityRenderer.js';
import { EffectsRenderer } from './EffectsRenderer.js';
import { ThermalDistortionBuffer } from './thermal/ThermalDistortionBuffer.js';
import { HeatHazeRenderer } from './thermal/HeatHazeRenderer.js';
import { VisualSettings } from './VisualSettings.js';
import { FLUID_TYPES, waterCss, THERMAL_STOPS } from './VisualTheme.js';
import { BUILD_CATALOG } from '../building/BuildCatalog.js';
import { clamp } from '../utils/MathUtils.js';
import { DUCT_TOOLS } from '../building/PlacementValidator.js';
import { CoolingDuctRenderer } from './cooling/CoolingDuctRenderer.js';
import { CoolingFlowRenderer } from './cooling/CoolingFlowRenderer.js';
import { CoolingOverlayRenderer } from './cooling/CoolingOverlayRenderer.js';
import { CoolingUnitRenderer } from './cooling/CoolingUnitRenderer.js';

export class Renderer {
  constructor(canvas,camera,{tilePixels=14}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.camera=camera;this.tile=tilePixels;
    this.mode='normal';this.debug=false;this.hover=null;this.buildSystem=null;this.selectedEntity=null;this.level=null;
    this.tileRenderer=new TileRenderer();this.heatmap=new HeatmapRenderer();this.airflow=new AirflowRenderer();this.pressure=new PressureRenderer();
    this.entities=new EntityRenderer();this.effects=new EffectsRenderer();
    this.coolingDucts=new CoolingDuctRenderer();this.coolingFlow=new CoolingFlowRenderer();this.coolingOverlay=new CoolingOverlayRenderer();this.coolingUnits=new CoolingUnitRenderer();
    this.distortionBuffer=new ThermalDistortionBuffer();this.heatHaze=new HeatHazeRenderer({quality:VisualSettings.heatHazeQuality,maxRegions:VisualSettings.maxHazeRegions});
  }

  resize(){
    const dpr=Math.min(2,devicePixelRatio||1),r=this.canvas.getBoundingClientRect(),w=Math.max(1,Math.floor(r.width*dpr)),h=Math.max(1,Math.floor(r.height*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.dpr=dpr;
  }

  draw(world,simulation){
    this.resize();
    const ctx=this.ctx,time=VisualSettings.reduceMotion?0:performance.now()/1000;
    const width=this.canvas.width/this.dpr,height=this.canvas.height/this.dpr;

    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.clearRect(0,0,width,height);
    const bg=ctx.createLinearGradient(0,0,0,height);
    bg.addColorStop(0,'#07111f');bg.addColorStop(1,'#020617');
    ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);

    const renderDirect=this.mode==='thermal';
    if(renderDirect||this.distortionBuffer.ensure(width,height,this.dpr)){
      const scene=renderDirect?ctx:this.distortionBuffer.context();
      scene.save();
      scene.scale(this.camera.zoom,this.camera.zoom);
      scene.translate(-this.camera.x,-this.camera.y);
      this.tileRenderer.draw(scene,world,this.tile,this.zones||[],this.mode);
      if(this.mode==='thermal')this.heatmap.draw(scene,world,this.tile);
      this.entities.draw(scene,world,this.tile,this.mode,time,{selectedEntity:this.selectedEntity});
      this.coolingDucts.draw(scene,world,this.tile,this.mode,this.camera.zoom);
      this.effects.draw(scene,world,this.tile,this.mode,time);
      if(this.buildSystem?.selected)this.drawBuildPreview(scene,world,time);
      this.drawRecentPlacement(scene,time);
      scene.restore();

      if(!renderDirect){
        const allowHeatHaze=VisualSettings.heatHaze&&this.mode!=='pressure';
        if(allowHeatHaze)this.heatHaze.render(ctx,this.distortionBuffer.canvas,world,this.camera,this.tile,this.mode,time,width,height,this.dpr);
        else ctx.drawImage(this.distortionBuffer.canvas,0,0,this.distortionBuffer.canvas.width,this.distortionBuffer.canvas.height,0,0,width,height);
      }
    }

    ctx.save();
    ctx.scale(this.camera.zoom,this.camera.zoom);
    ctx.translate(-this.camera.x,-this.camera.y);
    this.drawZones(ctx);
    if(this.mode==='pressure')this.pressure.draw(ctx,world,this.tile);
    if(this.mode==='fluid')this.drawFluidNetwork(ctx,world,time);
    if(this.mode==='cooling'&&simulation.cooling){
      this.coolingOverlay.draw(ctx,world,this.tile,time,this.camera.zoom,this.selectedEntity);
      this.coolingFlow.draw(ctx,simulation.cooling.networks,this.tile,time,this.camera.zoom);
      for(const unit of simulation.cooling.units)this.coolingUnits.draw(ctx,unit,this.tile,this.camera.zoom);
    }
    if(this.mode==='airflow'){
      this.airflow.draw(ctx,world,this.tile,time,this.camera.zoom);
      this.drawFocusedAirflow(ctx,world,time);
    }
    this.drawFailureAlerts(ctx,world,simulation,time);
    this.drawEventHighlight(ctx,world,simulation,time);
    this.drawSelection(ctx);
    if(this.selectedEntity?.type==='exchanger'){
      const machine=world.entities.find(e=>e.id===this.selectedEntity.machineId)||world.entities.find(e=>e.isHeatMachine&&Math.abs(e.x-this.selectedEntity.x)+Math.abs(e.y-this.selectedEntity.y)===1);
      if(machine)this.outlineEntity(ctx,machine,'#fb923c',time,1.2);
    }
    this.drawHover(ctx,world,time);
    if(this.debug)this.drawDebug(ctx,world);
    ctx.restore();

    this.drawSelectionCard(ctx,simulation,width,height);
    this.drawEventBanner(ctx,simulation,width);
    this.drawLegend(ctx,simulation,width);
    if(this.debug)this.drawVisualPhysicsDebug(ctx,time,world,simulation.metrics);
  }

  preloadSprites(){return this.entities.preloadSprites();}

  drawBuildPreview(ctx,world,time){
    const p=this.hover,tool=this.buildSystem.selected;if(!p||(!world.inBounds(p.x,p.y)&&tool!=='pipe'&&!DUCT_TOOLS.has(tool)))return;
    const pipePath=tool==='pipe'?this.pipePreview?.():null;
    const utilityPath=DUCT_TOOLS.has(tool)?this.pipePreview?.():null;
    if(utilityPath?.length&&DUCT_TOOLS.has(tool)){
      const plan=this.buildSystem.utilityPlacement.planPath(tool,utilityPath,{inventory:this.buildSystem.inventory[tool]??0,budget:this.buildSystem.budget,cost:BUILD_CATALOG[tool].cost});
      for(const point of plan.entries){
        this.coolingDucts.preview(ctx,point.x,point.y,this.tile,tool,point.valid,this.camera.zoom,{embedded:point.embedded});
      }
      return;
    }
    if(pipePath?.length){
      const simulated=[];
      let remaining=this.buildSystem.inventory.pipe??0,budget=this.buildSystem.budget;
      const pipeCost=BUILD_CATALOG.pipe.cost;
      for(const point of pipePath){
        const previewWorld={...world,entities:world.entities.concat(simulated),entityAt:(x,y)=>world.entityAt(x,y)||simulated.find(e=>e.x===x&&e.y===y)};
        const valid=remaining>0&&budget>=pipeCost&&this.buildSystem.validator.canPlace('pipe',point.x,point.y,{additionalEntities:simulated});
        this.entities.drawPreview(ctx,previewWorld,'pipe',point.x,point.y,this.buildSystem.direction(),this.tile,this.mode,time,valid);
        ctx.save();ctx.fillStyle=valid?'rgba(34,197,94,.12)':'rgba(239,68,68,.16)';ctx.strokeStyle=valid?'#4ade80':'#f87171';ctx.lineWidth=Math.max(1,1.6/this.camera.zoom);ctx.fillRect(point.x*this.tile,point.y*this.tile,this.tile,this.tile);ctx.strokeRect(point.x*this.tile+1,point.y*this.tile+1,this.tile-2,this.tile-2);ctx.restore();
        if(valid){simulated.push({id:`preview-${point.x}-${point.y}`,type:'pipe',x:point.x,y:point.y});remaining--;budget-=pipeCost;}
      }
      return;
    }
    const valid=this.buildSystem.validator.canPlace(tool,p.x,p.y)&&this.buildSystem.canAfford(tool),c=BUILD_CATALOG[tool];
    if(c?.kind==='material'){
      ctx.save();ctx.globalAlpha=valid?.48:.24;
      this.tileRenderer.material(ctx,world.registry.get(c.material),p.x,p.y,p.x*this.tile,p.y*this.tile,this.tile);
      ctx.restore();
    }else if(DUCT_TOOLS.has(tool)){
      this.coolingDucts.preview(ctx,p.x,p.y,this.tile,tool,valid,this.camera.zoom,{embedded:!world.isAir(p.x,p.y)});
    }
    else this.entities.drawPreview(ctx,world,tool,p.x,p.y,this.buildSystem.direction(),this.tile,this.mode,time,valid);

    if(tool==='exchanger'){
      const machine=world.entities.find(e=>e.isHeatMachine&&Math.abs(e.x-p.x)+Math.abs(e.y-p.y)===1);
      if(machine)this.outlineEntity(ctx,machine,'#fb923c',time,1.2);
    }
    ctx.save();ctx.fillStyle=valid?'rgba(34,197,94,.1)':'rgba(239,68,68,.14)';ctx.strokeStyle=valid?'#4ade80':'#f87171';
    ctx.lineWidth=Math.max(1,1.6/this.camera.zoom);ctx.fillRect(p.x*this.tile,p.y*this.tile,this.tile,this.tile);ctx.strokeRect(p.x*this.tile+1,p.y*this.tile+1,this.tile-2,this.tile-2);ctx.restore();
  }



  drawRecentPlacement(ctx,time){
    const item=this.buildSystem?.lastPlacement;if(!item)return;
    if(VisualSettings.reduceMotion)return;
    const elapsed=((globalThis.performance?.now?.()??Date.now())-item.at)/1000;if(elapsed<0||elapsed>.48)return;
    const progress=elapsed/.48,x=(item.x+.5)*this.tile,y=(item.y+.5)*this.tile;
    ctx.save();ctx.globalAlpha=1-progress;ctx.strokeStyle='#67e8f9';ctx.lineWidth=Math.max(1,1.7/this.camera.zoom);ctx.beginPath();ctx.arc(x,y,this.tile*(.32+progress*.75),0,Math.PI*2);ctx.stroke();ctx.restore();
  }

  outlineEntity(ctx,e,color,time,scale=1){
    const x=e.x*this.tile,y=e.y*this.tile,pulse=VisualSettings.reduceMotion ? .65 : .48+.45*(.5+.5*Math.sin(time*5));
    ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=pulse;ctx.shadowColor=color;ctx.shadowBlur=this.tile*.4;
    ctx.lineWidth=Math.max(1.3,2/this.camera.zoom)*scale;ctx.setLineDash([this.tile*.15,this.tile*.09]);
    ctx.strokeRect(x-this.tile*.1,y-this.tile*.1,this.tile*1.2,this.tile*1.2);ctx.restore();
  }

  drawFailureAlerts(ctx,world,simulation,time){
    const system=simulation.mission.failures;if(!system)return;
    for(const e of world.entities){
      const risk=system.statusFor(e);if(!risk)continue;
      this.outlineEntity(ctx,e,'#fb3f57',time,1.15);
      const x=(e.x+.5)*this.tile,y=(e.y+.05)*this.tile;
      ctx.save();ctx.fillStyle='#7f1d1d';ctx.strokeStyle='#fda4af';ctx.lineWidth=Math.max(1,1/this.camera.zoom);
      ctx.beginPath();ctx.arc(x,y,this.tile*.24,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff1f2';ctx.font='900 '+Math.max(7,this.tile*.25)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(Math.ceil(risk.remaining)+'s',x,y);
      ctx.restore();
    }
  }

  drawEventHighlight(ctx,world,simulation,time){
    const recent=simulation.mission.events.lastEvent;if(!recent||simulation.elapsed>recent.expires)return;
    const alpha=VisualSettings.reduceMotion?.55:clamp((recent.expires-simulation.elapsed)/1.4,0,1)*.45;
    const ids=new Set(recent.targets.map(e=>e.id));
    const zoneId=recent.event.filter?.zoneId;
    const zone=zoneId?this.zones?.find(z=>z.id===zoneId):null;
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle='#67e8f9';ctx.fillStyle='rgba(34,211,238,.08)';ctx.lineWidth=Math.max(1.3,2/this.camera.zoom);ctx.setLineDash([this.tile*.24,this.tile*.12]);
    if(zone){const x=zone.x*this.tile,y=zone.y*this.tile,w=zone.width*this.tile,h=zone.height*this.tile;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}
    else for(const e of recent.targets){ctx.beginPath();ctx.arc((e.x+.5)*this.tile,(e.y+.5)*this.tile,this.tile*(.42+.1*Math.sin(time*5)),0,Math.PI*2);ctx.stroke();}
    ctx.setLineDash([]);ctx.restore();
  }

  drawEventBanner(ctx,simulation,width){
    const recent=simulation.mission.events.lastEvent;if(!recent||simulation.elapsed>recent.expires)return;
    const text=recent.event.message||'Evento operacional';ctx.save();ctx.font='700 10px system-ui';
    const w=Math.min(width-24,ctx.measureText(text).width+28),x=(width-w)/2,y=width<560?86:16;
    ctx.fillStyle='rgba(8,24,38,.94)';ctx.strokeStyle='rgba(34,211,238,.7)';ctx.beginPath();ctx.roundRect(x,y,w,28,8);ctx.fill();ctx.stroke();
    ctx.fillStyle='#a5f3fc';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x+w/2,y+14,w-16);ctx.restore();
  }

  drawFocusedAirflow(ctx,world,time){
    const e=this.selectedEntity;if(!e||!['fan','exhaust'].includes(e.type))return;
    const d=e.direction,cx=(e.x+.5)*this.tile,cy=(e.y+.5)*this.tile;
    ctx.save();ctx.strokeStyle='rgba(103,232,249,.9)';ctx.fillStyle='rgba(34,211,238,.07)';ctx.lineWidth=Math.max(1,1.6/this.camera.zoom);
    const length=this.tile*5,half=this.tile*1.05;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+d.x*length-d.y*half,cy+d.y*length+d.x*half);ctx.lineTo(cx+d.x*length+d.y*half,cy+d.y*length-d.x*half);ctx.closePath();ctx.fill();ctx.stroke();
    for(let step=1;step<=4;step++){
      const x=e.x+d.x*step,y=e.y+d.y*step;if(!world.inBounds(x,y)||!world.isAir(x,y))break;
      const i=world.index(x,y),vx=world.airX[i],vy=world.airY[i],speed=Math.hypot(vx,vy);if(speed<.08)continue;
      const px=(x+.5)*this.tile,py=(y+.5)*this.tile,len=this.tile*.23;
      ctx.beginPath();ctx.moveTo(px-vx/speed*len,py-vy/speed*len);ctx.lineTo(px+vx/speed*len,py+vy/speed*len);ctx.stroke();
    }
    ctx.restore();
  }

  drawSelectionCard(ctx,simulation,width,height){
    const e=this.selectedEntity;if(!e)return;
    const p=this.camera.worldToScreen((e.x+.5)*this.tile,(e.y+.5)*this.tile),w=Math.max(40,Math.min(164,width-16)),h=58,gap=10;
    let x=p.x+gap,y=p.y-h/2;if(x+w>width-8)x=p.x-w-gap;x=clamp(x,8,Math.max(8,width-w-8));y=clamp(y,8,height-h-8);
    const temp=e.temperature??e.waterTemperature??e.airTemperature??e.outdoorTemperature;
    const power=e.isHeatMachine?e.heatOutput:e.power||e.thermalPower||0;
    const state=e.isHeatMachine?(e.started?'EM OPERAÇÃO':'AGUARDANDO'):FLUID_TYPES.has(e.type)?(e.networkStatus||'SEM REDE'):e.networkStatus&&e.networkStatus!=='READY'?e.networkStatus:e.status|| (e.enabled?'OPERACIONAL':'DESLIGADO');
    ctx.save();ctx.fillStyle='rgba(4,13,24,.94)';ctx.strokeStyle='#facc15';ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(x,y,w,h,8);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f8fafc';ctx.font='700 10px system-ui';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(e.name||e.type,x+9,y+7,Math.max(12,w-18));
    ctx.fillStyle='#cbd5e1';ctx.font='9px system-ui';ctx.fillText((Number.isFinite(temp)?temp.toFixed(1)+'°C':'—')+'  ·  '+this.formatPower(power),x+9,y+25,Math.max(12,w-18));
    ctx.fillStyle='#67e8f9';ctx.fillText(state,x+9,y+41,Math.max(12,w-18));ctx.restore();
  }

  formatPower(w){return Math.abs(w)>=1000?(w/1000).toFixed(1)+' kW':Math.round(w)+' W';}

  drawZones(ctx){
    if(!this.zones?.length)return;
    const thermal=this.mode==='thermal';
    ctx.save();ctx.globalAlpha=thermal?.48:1;ctx.font='700 '+Math.max(7,this.tile*.34)+'px system-ui';ctx.textBaseline='top';
    for(const z of this.zones){const x=z.x*this.tile,y=z.y*this.tile,w=z.width*this.tile,h=z.height*this.tile;ctx.strokeStyle=thermal?'rgba(56,189,248,.1)':'rgba(56,189,248,.16)';ctx.lineWidth=Math.max(.7,1/this.camera.zoom);ctx.setLineDash([this.tile*.24,this.tile*.18]);ctx.strokeRect(x+.5,y+.5,w-1,h-1);ctx.setLineDash([]);if(!thermal){ctx.fillStyle='rgba(2,6,23,.68)';const label=(z.name||z.id)+(z.target?' · < '+z.target+'°C':'');const mw=ctx.measureText(label).width+8;ctx.fillRect(x+3,y+3,mw,Math.max(12,this.tile*.58));ctx.fillStyle='#7dd3fc';ctx.fillText(label,x+7,y+5);}}
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
    for(const e of fluid){
      const neighbors=[[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>{const n=world.entityAt(e.x+dx,e.y+dy);return n&&FLUID_TYPES.has(n.type);});
      const needsAttention=(e.type==='pump'&&(!e.circuitClosed||(e.flowRate||0)<.02))||(e.type==='pipe'&&neighbors.length<2);
      if(!needsAttention)continue;
      const x=(e.x+.5)*this.tile,y=(e.y+.5)*this.tile-this.tile*.28;
      ctx.fillStyle='#7c2d12';ctx.strokeStyle='#fbbf24';ctx.lineWidth=Math.max(1,1/this.camera.zoom);
      ctx.beginPath();ctx.arc(x,y,this.tile*.18,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff7ed';ctx.font='900 '+Math.max(7,this.tile*.22)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',x,y);
    }
    ctx.restore();
  }

  drawSelection(ctx){
    const e=this.selectedEntity;if(!e)return;
    const x=e.x*this.tile,y=e.y*this.tile,pulse=VisualSettings.reduceMotion ? .7 : .5+.5*Math.sin(performance.now()/180);
    ctx.save();ctx.strokeStyle='rgba(250,204,21,'+(.55+pulse*.35)+')';ctx.lineWidth=Math.max(1.2,2/this.camera.zoom);
    ctx.setLineDash([this.tile*.18,this.tile*.12]);ctx.strokeRect(x-this.tile*.12,y-this.tile*.12,this.tile*1.24,this.tile*1.24);ctx.setLineDash([]);ctx.restore();
  }

  drawHover(ctx,world,time){
    if(!this.hover||!world.inBounds(this.hover.x,this.hover.y))return;
    const x=this.hover.x,y=this.hover.y,selected=this.buildSystem?.selected;
    const valid=selected?this.buildSystem.validator.canPlace(selected,x,y)&&this.buildSystem.canAfford(selected):true,pulse=VisualSettings.reduceMotion ? .7 : .5+.5*Math.sin(time*5);
    ctx.save();ctx.fillStyle=selected?(valid?'rgba(34,197,94,.09)':'rgba(239,68,68,.12)'):'rgba(248,250,252,.025)';
    ctx.fillRect(x*this.tile,y*this.tile,this.tile,this.tile);
    ctx.strokeStyle=selected?(valid?'#4ade80':'#f87171'):'#f8fafc';ctx.globalAlpha=.72+pulse*.25;ctx.lineWidth=Math.max(1,2/this.camera.zoom);ctx.strokeRect(x*this.tile+1,y*this.tile+1,this.tile-2,this.tile-2);ctx.globalAlpha=1;
    if(selected&&['fan','exhaust','pump','supplyVent','coolingUnit'].includes(selected)){
      const d=this.buildSystem.direction(),cx=(x+.5)*this.tile,cy=(y+.5)*this.tile;
      const distance=selected==='pump'?this.tile*1.4:this.tile*4;
      const spread=selected==='pump'?this.tile*.28:this.tile*.9;
      ctx.fillStyle='rgba(14,165,233,.07)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+d.x*distance-d.y*spread,cy+d.y*distance+d.x*spread);ctx.lineTo(cx+d.x*distance+d.y*spread,cy+d.y*distance-d.x*spread);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#7dd3fc';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+d.x*(distance*.85),cy+d.y*(distance*.85));ctx.stroke();
    }
    if(selected==='exchanger'){
      const machine=world.entities.find(e=>e.isHeatMachine&&Math.abs(e.x-x)+Math.abs(e.y-y)===1);
      if(machine)this.outlineEntity(ctx,machine,'#fb923c',time,1.2);
    }
    ctx.restore();
  }

  drawDebug(ctx,world){
    if(!this.hover||!world.inBounds(this.hover.x,this.hover.y))return;
    const t=world.tileMap.get(this.hover.x,this.hover.y),i=world.index(t.x,t.y),p=world.airPressure?.[i]||0,div=world.airDivergence?.[i]||0,txt=['('+t.x+','+t.y+')',t.material.name,t.temperature.toFixed(2)+'°C','E '+(t.thermalEnergy/1000).toFixed(1)+' kJ','air '+t.airflowX.toFixed(2)+', '+t.airflowY.toFixed(2),'p '+p.toFixed(2)+' Pa','div '+div.toFixed(4)];
    ctx.font='10px ui-monospace,monospace';const x=t.x*this.tile+this.tile+4,y=t.y*this.tile;
    ctx.fillStyle='rgba(2,6,23,.94)';ctx.fillRect(x,y,138,txt.length*13+8);ctx.strokeStyle='#334155';ctx.strokeRect(x+.5,y+.5,137,txt.length*13+7);
    ctx.fillStyle='#e2e8f0';txt.forEach((s,i)=>ctx.fillText(s,x+5,y+14+i*13));
  }

  drawVisualPhysicsDebug(ctx,time,world,metrics){
    const stream=this.airflow.diagnostics(time);
    const haze=this.heatHaze.diagnostics();
    const sprites=this.entities.sprites.manager.stats,entityStats=this.entities.stats||{};
    const air=world.airDiagnostics||{},n=(value,digits=2)=>Number(value||0).toFixed(digits);
    const lines=[
      'AIRFLOW',
      `Velocity max/avg ${n(air.maxVelocity)} / ${n(air.averageVelocity)} m/s`,
      `Pressure ${n(air.maxPressure)} Pa   Div ${n(air.maxDivergence,4)}`,
      'FANS',
      `Free/actual ${n(air.totalFanFreeFlow)} / ${n(air.totalFanActualFlow)} m³/s`,
      `Operating point ${n(100*air.averageFanOperatingPoint,0)}%`,
      'EXHAUST',
      `Flow ${n(air.totalExhaustActualFlow)} m³/s   OP ${n(100*air.averageExhaustOperatingPoint,0)}%`,
      `Heat rejection ${n(metrics?.exhaustRejectedPower/1000)} kW`,
      'THERMAL',
      `Machine heat ${n(world.entities.filter(e=>e.isHeatMachine).reduce((s,e)=>s+(e.heatGenerationPower||0),0)/1000)} kW`,
      `Machine cooling ${n(metrics?.machineCoolingPower/1000)} kW`,
      `External rejection ${n(metrics?.externalRejectedPower/1000)} kW`,
      'VISUAL PHYSICS',
      `Sprites      ${sprites.loaded}/${sprites.available}`,
      `Animated     ${entityStats.animated||0}   Fallback ${entityStats.fallbacks||0}`,
      'Streamlines  '+String(stream.active).padStart(4),
      'Points       '+String(stream.points).padStart(4),
      'Stream gen   '+stream.generationMs.toFixed(2)+' ms',
      'Cache age    '+stream.cacheAgeMs.toFixed(0)+' ms',
      'Haze regions '+String(haze.regions).padStart(4),
      'Haze render  '+haze.renderMs.toFixed(2)+' ms',
    ];
    const h=lines.length*12+14,x=18,y=Math.max(80,this.canvas.height/this.dpr-h-16),w=280;
    ctx.save();
    ctx.fillStyle='rgba(2,6,23,.9)';ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='rgba(71,85,105,.7)';ctx.strokeRect(x+.5,y+.5,w-1,h-1);
    ctx.font='9px ui-monospace,monospace';
    lines.forEach((line,i)=>{
      ctx.fillStyle=i===0?'#67e8f9':'#cbd5e1';
      ctx.fillText(line,x+7,y+14+i*12);
    });
    ctx.restore();
  }

  drawLegend(ctx,simulation,width=1000){
    const configs={
      thermal:{title:'TEMPERATURA · FOCO 25–40°C',left:'',right:'',colors:[]},
      airflow:{title:'FLUXO DE AR',left:'baixo',right:'alto',colors:['#0f2742','#0ea5e9','#bae6fd']},
      pressure:{title:'PRESSÃO RELATIVA',left:'negativa',right:'positiva',colors:['#2563eb','#64748b','#ef4444']},
      fluid:{title:'ÁGUA / REDE',left:'fria',right:'quente',colors:['#2563eb','#22d3ee','#2dd4bf','#facc15','#f97316']},
      cooling:{title:'CLIMATIZAÇÃO',left:'baixa capacidade',right:'alta capacidade',colors:['#38bdf8','#a78bfa','#34d399','#f59e0b','#f472b6']},
    };
    const c=configs[this.mode];if(!c)return;
    const thermal=this.mode==='thermal';
    const x=14,y=thermal&&width<560?122:18,w=thermal?Math.max(120,Math.min(270,width-36)):168,h=10,g=ctx.createLinearGradient(x,y,x+w,y);
    if(thermal){
      for(const stop of THERMAL_STOPS){const position=thermalLegendPosition(stop.temp);g.addColorStop(position,'rgb('+stop.color.join(',')+')');}
    }else c.colors.forEach((color,i)=>g.addColorStop(i/(c.colors.length-1),color));
    const cardHeight=thermal?72:50;
    ctx.fillStyle='rgba(2,6,23,.91)';ctx.fillRect(x-8,y-11,w+16,cardHeight);ctx.strokeStyle='rgba(100,116,139,.65)';ctx.strokeRect(x-7.5,y-10.5,w+15,cardHeight-1);
    ctx.fillStyle='#cbd5e1';ctx.font='800 9px system-ui';ctx.fillText(c.title,x,y-2);
    ctx.fillStyle=g;ctx.fillRect(x,y+5,w,h);
    if(thermal){
      const targets=[...new Set((this.level?.objectives||[]).filter(o=>['machineTemperature','zoneTemperature','maxAirTemperature'].includes(o.type)).map(o=>o.max).filter(Number.isFinite))].sort((a,b)=>a-b);
      const failures=[...new Set((this.level?.failures||[]).map(f=>f.temperature).filter(Number.isFinite))].sort((a,b)=>a-b);
      for(const t of targets){const tx=x+thermalLegendPosition(t)*w;ctx.strokeStyle='#fff7ae';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(tx,y+3);ctx.lineTo(tx,y+18);ctx.stroke();}
      for(const t of failures){const tx=x+thermalLegendPosition(t)*w;ctx.strokeStyle='#fecaca';ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(tx,y+3);ctx.lineTo(tx,y+18);ctx.stroke();ctx.setLineDash([]);}
      ctx.fillStyle='#cbd5e1';ctx.font='7px system-ui';ctx.textAlign='center';
      const labels=w<225?[25,30,35,40,80]:[15,25,30,35,40,80];
      for(const t of labels){const pos=thermalLegendPosition(t);ctx.fillText(t===80?'80°+':t+'°',x+pos*w,y+29);}
      const target=targets[0]??this.zones?.find(z=>Number.isFinite(z.target))?.target??40,targetX=clamp(x+thermalLegendPosition(target)*w,x+32,x+w-32);
      ctx.fillStyle='#fde68a';ctx.font='8px system-ui';ctx.textAlign=targetX>x+w*.7?'right':'left';ctx.fillText('▼ '+target+'° META',targetX,y+42);ctx.textAlign='left';
      if(failures.length){const t=failures[0],tx=clamp(x+thermalLegendPosition(t)*w,x+30,x+w-30);ctx.fillStyle='#fca5a5';ctx.font='8px system-ui';ctx.textAlign=tx>x+w*.72?'right':'left';ctx.fillText('▲ '+t+'° FALHA',tx,y+55);ctx.textAlign='left';}
    }else{
      ctx.fillStyle='#cbd5e1';ctx.font='10px system-ui';ctx.fillText(c.left,x,y+31);ctx.fillText(c.right,x+w-ctx.measureText(c.right).width,y+31);
    }
  }
}
