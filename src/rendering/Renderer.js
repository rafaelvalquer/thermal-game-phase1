import { TileRenderer } from './TileRenderer.js';
import { HeatmapRenderer } from './HeatmapRenderer.js';
import { AirflowRenderer } from './AirflowRenderer.js';
import { PressureRenderer } from './PressureRenderer.js';
import { EntityRenderer } from './EntityRenderer.js';
import { EffectsRenderer } from './EffectsRenderer.js';
import { ThermalDistortionBuffer } from './thermal/ThermalDistortionBuffer.js';
import { HeatHazeRenderer } from './thermal/HeatHazeRenderer.js';
import { VisualSettings } from './VisualSettings.js';
import { FLUID_TYPES, waterCss } from './VisualTheme.js';
import { BUILD_CATALOG } from '../building/BuildCatalog.js';
import { clamp, rgbHeat } from '../utils/MathUtils.js';
import { DUCT_TOOLS, HVAC_PATH_TOOLS } from '../building/PlacementValidator.js';
import { DuctRenderer } from './hvac/DuctRenderer.js';
import { RefrigerantLineRenderer } from './hvac/RefrigerantLineRenderer.js';
import { HVACPortRenderer } from './hvac/HVACPortRenderer.js';
import { HVACPortResolver } from '../simulation/hvac/ports/HVACPortResolver.js';
import { HVACFlowRenderer } from './hvac/HVACFlowRenderer.js';
import { HVACOverlayRenderer } from './hvac/HVACOverlayRenderer.js';

export class Renderer {
  constructor(canvas,camera,{tilePixels=14}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.camera=camera;this.tile=tilePixels;
    this.mode='normal';this.debug=false;this.hover=null;this.buildSystem=null;this.selectedEntity=null;this.thermalScaleMode='fixed';this.level=null;
    this.tileRenderer=new TileRenderer();this.heatmap=new HeatmapRenderer();this.airflow=new AirflowRenderer();this.pressure=new PressureRenderer();
    this.entities=new EntityRenderer();this.effects=new EffectsRenderer();
    this.ducts=new DuctRenderer();this.refrigerantLines=new RefrigerantLineRenderer();this.hvacPorts=new HVACPortRenderer();this.hvacPortResolver=new HVACPortResolver();this.hvacFlow=new HVACFlowRenderer();this.hvacOverlay=new HVACOverlayRenderer();
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

    if(this.distortionBuffer.ensure(width,height,this.dpr)){
      const scene=this.distortionBuffer.context();
      scene.save();
      scene.scale(this.camera.zoom,this.camera.zoom);
      scene.translate(-this.camera.x,-this.camera.y);
      this.tileRenderer.draw(scene,world,this.tile,this.zones||[],this.mode);
      if(this.mode==='thermal')this.heatmap.draw(scene,world,this.tile,this.thermalScale(world));
      this.entities.draw(scene,world,this.tile,this.mode,time,{selectedEntity:this.selectedEntity});
      this.ducts.draw(scene,world,this.tile,this.mode,this.camera.zoom);
      this.refrigerantLines.draw(scene,world,this.tile,this.mode,time,this.camera.zoom);
      this.effects.draw(scene,world,this.tile,this.mode,time);
      if(this.buildSystem?.selected)this.drawBuildPreview(scene,world,time);
      this.drawRecentPlacement(scene,time);
      scene.restore();

      if(VisualSettings.heatHaze)this.heatHaze.render(ctx,this.distortionBuffer.canvas,world,this.camera,this.tile,this.mode,time,width,height,this.dpr);
      else ctx.drawImage(this.distortionBuffer.canvas,0,0,this.distortionBuffer.canvas.width,this.distortionBuffer.canvas.height,0,0,width,height);
    }

    ctx.save();
    ctx.scale(this.camera.zoom,this.camera.zoom);
    ctx.translate(-this.camera.x,-this.camera.y);
    this.drawZones(ctx);
    if(this.mode==='pressure')this.pressure.draw(ctx,world,this.tile);
    if(this.mode==='fluid')this.drawFluidNetwork(ctx,world,time);
    if(this.mode==='hvac'){
      this.hvacFlow.draw(ctx,world,this.tile,time,this.camera.zoom);
      this.hvacOverlay.draw(ctx,world,this.tile,time,this.camera.zoom);
      this.hvacPorts.draw(ctx,world,this.tile,this.camera.zoom);
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

  thermalScale(world){
    if(this.thermalScaleMode==='auto'){
      let min=Infinity,max=-Infinity;
      for(let i=0;i<world.size;i++){const t=world.temperatureAtIndex(i);min=Math.min(min,t);max=Math.max(max,t);}
      const targets=(this.level?.objectives||[]).filter(o=>['machineTemperature','zoneTemperature','maxAirTemperature'].includes(o.type)).map(o=>o.max).filter(Number.isFinite);
      const floor=Math.floor(min/10)*10,ceiling=Math.ceil(Math.max(max,...targets)/10)*10;
      return {min:Math.min(floor,10),max:Math.max(ceiling,20)};
    }
    const targets=(this.level?.objectives||[]).filter(o=>['machineTemperature','zoneTemperature','maxAirTemperature'].includes(o.type)).map(o=>o.max).filter(Number.isFinite);
    const failures=(this.level?.failures||[]).flatMap(f=>[f.temperature]).filter(Number.isFinite);
    return {min:10,max:Math.max(80,...targets,...failures)+10};
  }

  drawBuildPreview(ctx,world,time){
    const p=this.hover,tool=this.buildSystem.selected;if(!p||(!world.inBounds(p.x,p.y)&&tool!=='pipe'&&!HVAC_PATH_TOOLS.has(tool)))return;
    const pipePath=tool==='pipe'?this.pipePreview?.():null;
    const utilityPath=HVAC_PATH_TOOLS.has(tool)?this.pipePreview?.():null;
    if(utilityPath?.length&&HVAC_PATH_TOOLS.has(tool)){
      const plan=this.buildSystem.utilityPlacement.planPath(tool,utilityPath,{inventory:this.buildSystem.inventory[tool]??0,budget:this.buildSystem.budget,cost:BUILD_CATALOG[tool].cost});
      for(const point of plan.entries){
        const port=this.previewPortCompatibility(world,tool,point.x,point.y),valid=point.valid&&!port.incompatible;
        if(tool==='refrigerantLine')this.refrigerantLines.preview(ctx,point.x,point.y,this.tile,valid,this.camera.zoom,{embedded:point.embedded,blockedPort:port.incompatible});
        else this.ducts.preview(ctx,point.x,point.y,this.tile,tool,valid,this.camera.zoom,{embedded:point.embedded,role:port.role,color:port.incompatible?'#ef4444':null});
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
      const port=this.previewPortCompatibility(world,tool,p.x,p.y);this.ducts.preview(ctx,p.x,p.y,this.tile,tool,valid&&!port.incompatible,this.camera.zoom,{embedded:!world.isAir(p.x,p.y),role:port.role,color:port.incompatible?'#ef4444':null});
    }else if(tool==='refrigerantLine'){
      const port=this.previewPortCompatibility(world,tool,p.x,p.y);this.refrigerantLines.preview(ctx,p.x,p.y,this.tile,valid&&!port.incompatible,this.camera.zoom,{embedded:!world.isAir(p.x,p.y),blockedPort:port.incompatible});
    }
    else this.entities.drawPreview(ctx,world,tool,p.x,p.y,this.buildSystem.direction(),this.tile,this.mode,time,valid);

    if(tool==='exchanger'){
      const machine=world.entities.find(e=>e.isHeatMachine&&Math.abs(e.x-p.x)+Math.abs(e.y-p.y)===1);
      if(machine)this.outlineEntity(ctx,machine,'#fb923c',time,1.2);
    }
    ctx.save();ctx.fillStyle=valid?'rgba(34,197,94,.1)':'rgba(239,68,68,.14)';ctx.strokeStyle=valid?'#4ade80':'#f87171';
    ctx.lineWidth=Math.max(1,1.6/this.camera.zoom);ctx.fillRect(p.x*this.tile,p.y*this.tile,this.tile,this.tile);ctx.strokeRect(p.x*this.tile+1,p.y*this.tile+1,this.tile-2,this.tile-2);ctx.restore();
  }

  previewPortCompatibility(world,tool,x,y){
    const result={role:null,incompatible:false};
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const entity=world.entityAt(x+dx,y+dy);if(!entity)continue;
      if(tool==='refrigerantLine'){
        if(['supplyVent','returnVent'].includes(entity.type))result.incompatible=true;
        if(entity.type==='airHandler'&&!this.hvacPortResolver.portForCell(entity,x,y,'refrigerant'))result.incompatible=true;
        if(entity.type==='condenser'&&!this.hvacPortResolver.portForCell(entity,x,y,'refrigerant'))result.incompatible=true;
      }else if(DUCT_TOOLS.has(tool)){
        if(entity.type==='condenser')result.incompatible=true;
        if(entity.type==='airHandler'){
          const port=this.hvacPortResolver.airHandler(entity).find(item=>['supply','return'].includes(item.type)&&item.cell.x===x&&item.cell.y===y);
          if(port)result.role=port.type;else result.incompatible=true;
        }
        if(entity.type==='supplyVent')result.role='supply';
        if(entity.type==='returnVent')result.role='return';
      }
    }
    if(DUCT_TOOLS.has(tool)&&!result.role){
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const adjacent=world.utilitiesAt(x+dx,y+dy).find(item=>DUCT_TOOLS.has(item.type));if(adjacent?.networkRole){result.role=adjacent.networkRole;break;}
      }
    }
    return result;
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
    const temp=e.temperature??e.waterTemperature??e.airTemperature??(e.type==='airHandler'?e.supplyTemperature:e.outdoorTemperature);
    const power=e.isHeatMachine?e.heatOutput:e.type==='airHandler'?(e.power||0)+(e.compressorPower||0):e.type==='condenser'?(e.electricalPower||0):e.power||e.thermalPower||0;
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
    if(selected&&['fan','exhaust','pump','supplyVent','returnVent'].includes(selected)){
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
    const hvac=world.hvac,handlers=world.entitiesByType('airHandler'),condensers=world.entitiesByType('condenser');
    const supplyFlow=hvac?.networks.filter(network=>network.role==='supply').reduce((sum,network)=>sum+network.flowRate,0)||0;
    const returnFlow=hvac?.networks.filter(network=>network.role==='return').reduce((sum,network)=>sum+network.flowRate,0)||0;
    const hvacBalance=metrics?.hvacEnergyBalance;
    const lines=[
      'VISUAL PHYSICS',
      `Sprites      ${sprites.loaded}/${sprites.available}`,
      `Animated     ${entityStats.animated||0}   Fallback ${entityStats.fallbacks||0}`,
      `HVAC networks ${hvac?.networks.length||0}   REF ${hvac?.refrigerantCircuits.length||0}`,
      `Supply/return ${supplyFlow.toFixed(2)} / ${returnFlow.toFixed(2)} m³/s`,
      `Cooling/room  ${(metrics?.hvacCooling/1000||0).toFixed(1)} / ${(handlers.reduce((sum,e)=>sum+(e.actualRoomCooling||0),0)/1000).toFixed(1)} kW`,
      `Compressor/AH ${(handlers.reduce((sum,e)=>sum+(e.compressorPower||0),0)/1000).toFixed(1)} / ${(handlers.reduce((sum,e)=>sum+(e.power||0),0)/1000).toFixed(1)} kW`,
      `Rejected heat ${(condensers.reduce((sum,e)=>sum+(e.heatRejected||0),0)/1000).toFixed(1)} kW`,
      `Energy error  ${(hvacBalance?.errorPercent||0).toFixed(2)}%`,
      'Streamlines  '+String(stream.active).padStart(4),
      'Points       '+String(stream.points).padStart(4),
      'Stream gen   '+stream.generationMs.toFixed(2)+' ms',
      'Cache age    '+stream.cacheAgeMs.toFixed(0)+' ms',
      'Haze regions '+String(haze.regions).padStart(4),
      'Haze render  '+haze.renderMs.toFixed(2)+' ms',
    ];
    const x=18,y=this.canvas.height/this.dpr-222,w=238,h=206;
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
      thermal:{title:'TEMPERATURA',left:'10°C',right:'80°C+',colors:['#1450dc','#22d3ee','#28c85a','#facc15','#f97316','#e62323']},
      airflow:{title:'FLUXO DE AR',left:'baixo',right:'alto',colors:['#0f2742','#0ea5e9','#bae6fd']},
      pressure:{title:'PRESSÃO RELATIVA',left:'negativa',right:'positiva',colors:['#2563eb','#64748b','#ef4444']},
      fluid:{title:'ÁGUA / REDE',left:'fria',right:'quente',colors:['#2563eb','#22d3ee','#2dd4bf','#facc15','#f97316']},
      hvac:{title:'DUTOS HVAC',left:'insuflação fria',right:'retorno quente',colors:['#1450dc','#22d3ee','#28c85a','#facc15','#f97316']},
    };
    const c=configs[this.mode];if(!c)return;
    const thermal=this.mode==='thermal',scale=thermal?this.thermalScale(simulation.world):null;
    const x=14,y=thermal&&width<560?122:18,w=thermal?192:168,h=10,g=ctx.createLinearGradient(x,y,x+w,y);
    if(thermal){
      for(let i=0;i<=12;i++){const n=i/12;g.addColorStop(n,'rgb('+rgbHeat(scale.min+n*(scale.max-scale.min),scale.min,scale.max).join(',')+')');}
    }else c.colors.forEach((color,i)=>g.addColorStop(i/(c.colors.length-1),color));
    const cardHeight=thermal?58:50;
    ctx.fillStyle='rgba(2,6,23,.91)';ctx.fillRect(x-8,y-11,w+16,cardHeight);ctx.strokeStyle='rgba(100,116,139,.65)';ctx.strokeRect(x-7.5,y-10.5,w+15,cardHeight-1);
    ctx.fillStyle='#cbd5e1';ctx.font='800 9px system-ui';ctx.fillText(c.title,x,y-2);
    ctx.fillStyle=g;ctx.fillRect(x,y+5,w,h);
    if(thermal){
      const targets=[...new Set((this.level?.objectives||[]).filter(o=>['machineTemperature','zoneTemperature','maxAirTemperature'].includes(o.type)).map(o=>o.max).filter(t=>t>=scale.min&&t<=scale.max))].sort((a,b)=>a-b).slice(0,4);
      targets.forEach(t=>{const tx=x+(t-scale.min)/(scale.max-scale.min)*w;ctx.strokeStyle='#fff7ae';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(tx,y+3);ctx.lineTo(tx,y+18);ctx.stroke();});
      ctx.fillStyle='#cbd5e1';ctx.font='9px system-ui';ctx.fillText(scale.min+'°C',x,y+30);const right=scale.max+'°C';ctx.fillText(right,x+w-ctx.measureText(right).width,y+30);
      ctx.fillStyle='#fde68a';ctx.font='8px system-ui';ctx.fillText('Alvos da missão',x,y+43);
      if(targets.length){ctx.fillStyle='#fff7ae';ctx.textAlign='right';ctx.fillText(targets.map(t=>t+'°').join(' · '),x+w,y+43);ctx.textAlign='left';}
    }else{
      ctx.fillStyle='#cbd5e1';ctx.font='10px system-ui';ctx.fillText(c.left,x,y+31);ctx.fillText(c.right,x+w-ctx.measureText(c.right).width,y+31);
    }
  }
}
