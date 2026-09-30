import { FLUID_TYPES, dirAngle, heatCss, thermalState, thermalGameplayCss, thermalGameplayState, waterCss } from './VisualTheme.js';
import { EquipmentSpriteRenderer } from './sprites/EquipmentSpriteRenderer.js';
import { ViewportCulling } from './ViewportCulling.js';

const THERMAL_ENTITIES=new Set(['machine','serverRack','furnace']);
const CLIMATE_ENTITIES=new Set(['coolingUnit','supplyVent']);

export class EntityRenderer {
  constructor({CanvasClass=globalThis.OffscreenCanvas,clock=()=>globalThis.performance?.now?.()??Date.now(),maxStaticLayerPixels=8_000_000,staticLayerRefreshMs=50}={}){this.sprites=new EquipmentSpriteRenderer();this.sprites.fallback=this;this.cachedOrder=[];this.cachedDynamicOrder=[];this.cachedVersion=-1;this.cachedStaticVersion=-1;this.cachedDynamicVersion=-1;this.staticEntities=[];this.dynamicEntities=[];this.rackOrientationCanvases=new Map();this.CanvasClass=CanvasClass;this.clock=clock;this.maxStaticLayerPixels=maxStaticLayerPixels;this.staticLayerRefreshMs=staticLayerRefreshMs;this.staticLayerCanvas=null;this.staticLayerContext=null;this.staticLayerSignature=null;this.staticLayerUpdatedAt=-Infinity;this.staticLayerDrawCount=0;this.staticLayerFallbackCount=0;}
  preloadSprites(){return this.sprites.preload();}

  draw(ctx,world,tile,mode,time=0,{selectedEntity=null,bounds=null,zoom=1,deferThermalIndicators=false}={}){
    this.stats={spriteDraws:0,fallbacks:0,animated:0,visibleEntities:0};
    if(this.cachedStaticVersion!==world.staticVisualVersion||this.cachedVersion<0){
      this.staticEntities=world.entities.filter(entity=>!entity.isTechnician);
      this.cachedStaticVersion=world.staticVisualVersion;
      this.cachedOrder=this.sorted(this.staticEntities,tile);
    }
    if(this.cachedDynamicVersion!==world.dynamicVisualVersion||this.cachedVersion<0){this.dynamicEntities=world.entities.filter(entity=>entity.isTechnician);this.cachedDynamicOrder=this.sorted(this.dynamicEntities,tile);this.cachedDynamicVersion=world.dynamicVisualVersion;}
    this.cachedVersion=world.entityVisualVersion;
    const viewport=ViewportCulling.fromBounds(bounds,tile,3);
    const thermalMachines=[];
    const useStaticLayer=typeof ctx.drawImage==='function'&&this.prepareStaticLayer(world,tile,mode,time,selectedEntity,viewport);
    if(useStaticLayer){
      ctx.imageSmoothingEnabled=false;ctx.drawImage(this.staticLayerCanvas,0,0);this.stats.spriteDraws++;
      this.stats.fallbacks=this.staticLayerFallbackCount;
      for(const item of this.cachedOrder){const e=item.entity;if(!viewport.contains(e.x,e.y))continue;this.stats.visibleEntities++;if(this.sprites.isAnimated(e))this.stats.animated++;if(mode==='thermal'&&THERMAL_ENTITIES.has(e.type))thermalMachines.push(e);}
      for(const item of this.cachedDynamicOrder){const e=item.entity;if(!viewport.contains(e.x,e.y))continue;this.stats.visibleEntities++;this.drawEntity(ctx,world,e,tile,mode,time,selectedEntity,thermalMachines);}
    }else{
      let staticIndex=0,dynamicIndex=0;
      // Stable depth order is kept when an offscreen static layer is unavailable.
      while(staticIndex<this.cachedOrder.length||dynamicIndex<this.cachedDynamicOrder.length){
        const stat=this.cachedOrder[staticIndex],dynamic=this.cachedDynamicOrder[dynamicIndex],statDepth=stat?stat.depth*tile:-Infinity,dynamicDepth=dynamic?dynamic.depth*tile:-Infinity;
        const item=dynamic&&(!stat||dynamicDepth<statDepth||dynamicDepth===statDepth&&dynamic.order<stat.order)?this.cachedDynamicOrder[dynamicIndex++]:this.cachedOrder[staticIndex++],e=item.entity;
        if(!viewport.contains(e.x,e.y))continue;this.stats.visibleEntities++;
        this.drawEntity(ctx,world,e,tile,mode,time,selectedEntity,thermalMachines);
      }
    }
    this.thermalIndicatorEntities=mode==='thermal'?thermalMachines:[];
    if(mode==='thermal'&&!deferThermalIndicators)this.drawThermalIndicators(ctx,tile,{selectedEntity,zoom});
    this.drawTechnicianWork(ctx,world,tile,mode);
  }

  prepareStaticLayer(world,tile,mode,time,selectedEntity,viewport){
    const width=Math.ceil(world.width*tile),height=Math.ceil(world.height*tile),pixels=width*height;
    if(width<=0||height<=0||pixels>this.maxStaticLayerPixels)return false;
    if(this.staticEntities.length){let visible=0;for(const item of this.cachedOrder)if(viewport.contains(item.entity.x,item.entity.y))visible++;if(visible/this.staticEntities.length<.65)return false;}
    if(!this.staticLayerCanvas||this.staticLayerCanvas.width!==width||this.staticLayerCanvas.height!==height){
      let canvas=null;try{if(typeof this.CanvasClass==='function')canvas=new this.CanvasClass(width,height);else if(typeof document!=='undefined')canvas=document.createElement('canvas');}catch{return false;}
      if(!canvas)return false;canvas.width=width;canvas.height=height;const context=canvas.getContext?.('2d');if(!context)return false;
      this.staticLayerCanvas=canvas;this.staticLayerContext=context;this.staticLayerSignature=null;
    }
    const selectedId=selectedEntity&&!selectedEntity.isTechnician&&selectedEntity.world===world?String(selectedEntity.id??''):'';
    const signature=[world,width,height,tile,mode,this.cachedStaticVersion,selectedId];
    const sameSignature=this.staticLayerSignature&&signature.every((value,index)=>value===this.staticLayerSignature[index]);
    const now=this.clock();
    if(!sameSignature||now-this.staticLayerUpdatedAt>=this.staticLayerRefreshMs){
      const target=this.staticLayerContext;target.save?.();target.setTransform?.(1,0,0,1,0,0);target.clearRect(0,0,width,height);target.imageSmoothingEnabled=false;
      let fallbacks=0;
      for(const item of this.cachedOrder){const e=item.entity;target.save?.();if(!this.drawEntity(target,world,e,tile,mode,time,selectedEntity,[],false))fallbacks++;target.restore?.();}
      target.restore?.();this.staticLayerSignature=signature;this.staticLayerUpdatedAt=now;this.staticLayerDrawCount++;this.staticLayerFallbackCount=fallbacks;
    }
    return true;
  }

  drawEntity(ctx,world,e,tile,mode,time,selectedEntity,thermalMachines,countStats=true){
    const visual=e.type==='technician'&&e.moveProgress>0?{...e,x:e.fromX+(e.toX-e.fromX)*e.moveProgress,y:e.fromY+(e.toY-e.fromY)*e.moveProgress}:e;
    if(this.sprites.draw(ctx,world,visual,tile,mode,time,{selected:e===selectedEntity})){
      if(e.type==='serverRack')this.rackOrientation(ctx,e,tile);
      if(countStats){this.stats.spriteDraws++;if(this.sprites.isAnimated(e))this.stats.animated++;}
      if(mode==='thermal'&&THERMAL_ENTITIES.has(e.type))thermalMachines.push(e);
      return true;
    }
    if(countStats)this.stats.fallbacks++;
    const x=e.x*tile,y=e.y*tile,cx=x+tile/2,cy=y+tile/2;ctx.save();
    if(mode!=='thermal')this.shadow(ctx,x,y,tile,e.type);
    if(e.type==='machine')this.machine(ctx,e,x,y,tile,time);
    else if(e.type==='serverRack')this.serverRack(ctx,e,x,y,tile,time);
    else if(e.type==='furnace')this.furnace(ctx,e,x,y,tile,time);
    else if(e.type==='passiveHeat')this.passiveHeat(ctx,e,x,y,tile,time);
    else if(e.type==='fan'||e.type==='exhaust')this.fan(ctx,e,cx,cy,tile,time);
    else if(FLUID_TYPES.has(e.type))this.fluid(ctx,world,e,x,y,tile,mode,time);
    else if(e.type==='sensor')this.sensor(ctx,e,cx,cy,tile,time);
    else if(CLIMATE_ENTITIES.has(e.type))this.climateDevice(ctx,e,x,y,tile,time);
    ctx.restore();
    if(mode==='thermal'&&THERMAL_ENTITIES.has(e.type))thermalMachines.push(e);
    return false;
  }

  drawThermalIndicators(ctx,tile,{selectedEntity=null,zoom=1}={}){
    const thermalMachines=this.thermalIndicatorEntities||[];
    if(thermalMachines.length){
      const bucketSize=32,labelBuckets=new Map();
      const bucketKeys=box=>{const keys=[];for(let y=Math.floor(box.y/bucketSize);y<=Math.floor((box.y+box.h)/bucketSize);y++)for(let x=Math.floor(box.x/bucketSize);x<=Math.floor((box.x+box.w)/bucketSize);x++)keys.push(x+':'+y);return keys;};
      const overlaps=box=>{for(const key of bucketKeys(box))for(const other of labelBuckets.get(key)||[])if(box.x<other.x+other.w&&box.x+box.w>other.x&&box.y<other.y+other.h&&box.y+box.h>other.y)return true;return false;};
      const reserve=box=>{for(const key of bucketKeys(box)){let bucket=labelBuckets.get(key);if(!bucket)labelBuckets.set(key,bucket=[]);bucket.push(box);}};
      for(const entity of thermalMachines.sort((a,b)=>(b===selectedEntity)-(a===selectedEntity))){
        // Put the value above the rack cell, clear of the duct row crossing its top.
        const width=Math.max(42,tile*.9),height=Math.max(12,tile*.72);
        const box={x:(entity.x+.5)*tile-width/2,y:entity.y*tile-height-tile*.08,w:width,h:height};
        const show=entity===selectedEntity||(zoom>=.85&&!overlaps(box));
        this.thermalIndicator(ctx,entity,tile,show);if(show)reserve(box);
      }
    }
  }

  sorted(entities,tile){return entities.map((entity,index)=>({entity,index,order:entity.world?.entityOrder?.(entity)??index,depth:entity.y+this.sprites.visualFootY(entity)})).sort((a,b)=>a.depth-b.depth||a.order-b.order);}

  drawTechnicianWork(ctx,world,tile,mode){
    for(const worker of world.entitySetByType?.('technician')||world.entitiesByType?.('technician')||[]){if(worker.action!=='working'||worker.targetRackId==null)continue;const rack=world.getEntityById?.(worker.targetRackId)||world.entities?.find(entity=>entity.id===worker.targetRackId);if(!rack)continue;
      const width=Math.max(116,tile*3.5),height=30,left=(rack.x+.5)*tile-width/2;let top=rack.y*tile-height-3;
      if(mode==='thermal')top-=Math.max(12,tile*.72);if(top<0)top=rack.y*tile+tile+2;
      const progress=Math.max(0,Math.min(1,worker.workProgress||0));ctx.save();ctx.fillStyle='rgba(2,10,20,.95)';ctx.strokeStyle='#22d3ee';ctx.lineWidth=Math.max(1,tile*.025);ctx.fillRect(left,top,width,height);ctx.strokeRect(left+.5,top+.5,width-1,height-1);
      ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='700 '+Math.max(8,tile*.22)+'px system-ui';ctx.fillStyle='#e0f2fe';let name=rack.name||'Rack';const maxName=Math.max(20,width-12);while(name.length>3&&ctx.measureText(name).width>maxName)name=name.slice(0,-2)+'…';ctx.fillText(name,left+6,top+8);
      ctx.textAlign='right';ctx.font='800 '+Math.max(7,tile*.17)+'px system-ui';ctx.fillStyle='#67e8f9';ctx.fillText('TROCA TÉRMICA +20%',left+width-6,top+8);
      ctx.fillStyle='#102a38';ctx.fillRect(left+6,top+17,width-12,5);ctx.fillStyle='#22d3ee';ctx.fillRect(left+6,top+17,(width-12)*progress,5);
      ctx.textAlign='right';ctx.font='700 '+Math.max(7,tile*.16)+'px ui-monospace,monospace';ctx.fillStyle='#cbd5e1';ctx.fillText(Math.ceil(worker.boostRemaining||0)+' s',left+width-6,top+26);ctx.restore();
    }
  }

  drawPreview(ctx,world,tool,x,y,direction,tile,mode,time=0,valid=true,model=null){
    const types={fan:'fan',exhaust:'exhaust',pipe:'pipe',pump:'pump',tank:'tank',radiator:'radiator',exchanger:'exchanger',sensor:'sensor',coolingUnit:'coolingUnit',industrialCoolingUnit:'coolingUnit',supplyVent:'supplyVent',serverRack:'serverRack',solarPanel:'solarPanel'};
    if(!types[tool])return false;
    const entity={id:987654,type:types[tool],x,y,direction:{...direction},tier:tool==='industrialCoolingUnit'?'industrial':model,footprintLength:tool==='industrialCoolingUnit'||model==='industrial'?2:1,enabled:true,started:true,currentVelocity:.35,currentFlow:.15,
      circuitClosed:false,flowRate:0,waterTemperature:25,inletTemperature:25,outletTemperature:25,thermalPower:0,
      airInTemperature:25,airOutTemperature:25,fanBoost:1,resistance:1,hydraulicPower:36,current:25,average:25,max:25,
      airIntakeDirection:{...direction},airExhaustDirection:{x:-direction.x,y:-direction.y},name:'Prévia',temperature:25};
    ctx.save();ctx.globalAlpha=valid?.58:.38;
    const previewWorld={...world,entities:[entity],entityAt:(tx,ty)=>world.entityAt(tx,ty)};
    if(!this.sprites.draw(ctx,previewWorld,entity,tile,mode,time,{preview:true,valid}))this.drawProcedural(ctx,previewWorld,entity,tile,mode,time);
    else if(entity.type==='serverRack')this.rackOrientation(ctx,entity,tile);
    ctx.restore();
    return true;
  }

  thermalIndicator(ctx,entity,tile,showLabel=true){
    if(!THERMAL_ENTITIES.has(entity.type)||!Number.isFinite(entity.temperature))return;
    const color=thermalGameplayState(entity.temperature);
    if(color){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.4,tile*.075);ctx.globalAlpha=.96;ctx.strokeRect(entity.x*tile+1.5,entity.y*tile+1.5,tile-3,tile-3);ctx.restore();}
    if(!showLabel)return;
    const label=entity.temperature.toFixed(1)+'°',cx=(entity.x+.5)*tile;
    ctx.save();ctx.font='700 '+Math.max(8,tile*.38)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    const width=ctx.measureText(label).width+6,height=Math.max(12,tile*.72);let left=cx-width/2,top=entity.y*tile-height-tile*.08;
    ctx.fillStyle='rgba(2,6,23,.94)';ctx.fillRect(left,top,width,height);
    ctx.strokeStyle='rgba(2,6,23,.8)';ctx.lineWidth=1;ctx.strokeRect(left+.5,top+.5,width-1,height-1);
    ctx.fillStyle=thermalGameplayCss(entity.temperature,1);ctx.fillText(label,cx,top+height/2);ctx.restore();
  }

  drawProcedural(ctx,world,e,tile,mode,time){
    return this.draw(ctx,{...world,entities:[e]},tile,mode,time);
  }

  shadow(ctx,x,y,tile,type){
    if(type==='pipe'||type==='duct')return;
    const g=ctx.createRadialGradient(x+tile*.5,y+tile*.64,tile*.1,x+tile*.5,y+tile*.64,tile*.58);
    g.addColorStop(0,'rgba(0,0,0,.38)');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x+tile*.5,y+tile*.7,tile*.62,tile*.4,0,0,Math.PI*2);ctx.fill();
  }

  climateDevice(ctx,e,x,y,tile,time){
    const cx=x+tile/2;
    if(e.type==='coolingUnit'){const active=(e.currentAirFlow||0)>0,color='#fb923c',g=ctx.createLinearGradient(x,y,x+tile,y+tile);g.addColorStop(0,'#475569');g.addColorStop(1,'#0f172a');ctx.fillStyle=g;ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,tile*.07);ctx.fillRect(x+tile*.08,y+tile*.12,tile*.84,tile*.76);ctx.strokeRect(x+tile*.08,y+tile*.12,tile*.84,tile*.76);ctx.fillStyle='#020617';ctx.fillRect(x+tile*.18,y+tile*.25,tile*.64,tile*.4);ctx.strokeStyle=color;ctx.lineWidth=Math.max(.7,tile*.035);for(let i=0;i<5;i++){const xx=x+tile*(.24+i*.13);ctx.beginPath();ctx.moveTo(xx,y+tile*.28);ctx.lineTo(xx,y+tile*.61);ctx.stroke();}ctx.fillStyle=e.status==='OVERLOAD'?'#fb7185':active?'#4ade80':'#fbbf24';ctx.beginPath();ctx.arc(x+tile*.77,y+tile*.76,tile*.055,0,Math.PI*2);ctx.fill();ctx.save();ctx.translate(cx,y+tile/2);if(active&&time>0)ctx.rotate(time*2.4);ctx.strokeStyle=color;ctx.beginPath();ctx.arc(0,0,tile*.13,0,Math.PI*2);for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.moveTo(0,0);ctx.lineTo(tile*.12,0);}ctx.stroke();ctx.restore();ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.atan2(e.direction?.y||0,e.direction?.x??1));ctx.fillStyle=color;ctx.globalAlpha=.95;for(let i=0;i<2;i++){const offset=tile*(.55+i*.22),size=tile*(.13-i*.02);ctx.beginPath();ctx.moveTo(offset+size,0);ctx.lineTo(offset-size*.65,-size*.55);ctx.lineTo(offset-size*.65,size*.55);ctx.closePath();ctx.fill();}ctx.restore();return;}
    const d=e.direction||{x:0,y:1};ctx.fillStyle='#0f172a';ctx.strokeStyle='#38bdf8';ctx.lineWidth=Math.max(1,tile*.06);ctx.fillRect(x+tile*.13,y+tile*.13,tile*.74,tile*.74);ctx.strokeRect(x+tile*.13,y+tile*.13,tile*.74,tile*.74);for(let i=0;i<4;i++){const f=(i+1)/5,xx=x+tile*(.2+f*.6),yy=y+tile*(.2+f*.6);ctx.beginPath();if(Math.abs(d.x)>0){ctx.moveTo(xx,y+tile*.24);ctx.lineTo(xx,y+tile*.76);}else{ctx.moveTo(x+tile*.24,yy);ctx.lineTo(x+tile*.76,yy);}ctx.stroke();}
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
    this.rackOrientation(ctx,e,tile);
  }

  rackOrientation(ctx,e,tile){
    const x=e.x*tile,y=e.y*tile;
    const intake=e.airIntakeDirection||{x:0,y:-1},exhaust=e.airExhaustDirection||{x:0,y:1};
    const key=tile+':'+intake.x+','+intake.y+':'+exhaust.x+','+exhaust.y;
    let image=this.rackOrientationCanvases.get(key);
    if(image){ctx.drawImage(image,x,y,tile,tile);return;}
    const Canvas=globalThis.OffscreenCanvas;
    let canvas=typeof Canvas==='function'?new Canvas(tile,tile):null;
    if(!canvas&&typeof document!=='undefined'){canvas=document.createElement('canvas');canvas.width=tile;canvas.height=tile;}
    const overlay=canvas?.getContext?.('2d');
    if(overlay){
      overlay.imageSmoothingEnabled=false;
      this.drawRackOrientation(overlay,{x:0,y:0,airIntakeDirection:intake,airExhaustDirection:exhaust},tile);
      this.rackOrientationCanvases.set(key,canvas);ctx.drawImage(canvas,x,y,tile,tile);return;
    }
    this.drawRackOrientation(ctx,e,tile);
  }

  drawRackOrientation(ctx,e,tile){
    const x=e.x*tile,y=e.y*tile;
    const arrow=(d,color)=>{
      d=d||{x:0,y:0};const cx=x+tile/2,cy=y+tile/2,ex=cx+d.x*tile*.48,ey=cy+d.y*tile*.48;
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,tile*.06);ctx.beginPath();ctx.moveTo(cx-d.x*tile*.18,cy-d.y*tile*.18);ctx.lineTo(ex,ey);ctx.stroke();
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(ex,ey,Math.max(1.5,tile*.07),0,Math.PI*2);ctx.fill();
    };
    ctx.save();arrow(e.airIntakeDirection,'#38bdf8');arrow(e.airExhaustDirection,'#fb923c');ctx.restore();
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
    if(e.type==='waterChiller')return this.waterChiller(ctx,world,e,x,y,tile,mode,time);
  }

  connections(world,e){
    return [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy])=>{
      const n=world.entityAt(e.x+dx,e.y+dy);return n&&FLUID_TYPES.has(n.type);
    });
  }

  pipe(ctx,world,e,x,y,tile,mode,time){
    const cx=x+tile/2,cy=y+tile/2,neighbors=this.connections(world,e);
    const links=neighbors.length?neighbors:[[1,0],[-1,0]];
    ctx.lineCap='square';ctx.lineJoin='miter';
    for(const [dx,dy] of links){
      ctx.strokeStyle='#15242a';ctx.lineWidth=tile*.38;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.5,cy+dy*tile*.5);ctx.stroke();
      ctx.strokeStyle=mode==='normal'?'#6e8588':waterCss(e.waterTemperature,1);ctx.lineWidth=tile*.23;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*tile*.5,cy+dy*tile*.5);ctx.stroke();
      ctx.strokeStyle=mode==='normal'?'#a7b9b3':waterCss(e.waterTemperature,.8);ctx.lineWidth=tile*.055;ctx.beginPath();ctx.moveTo(cx-dy*tile*.06,cy-dx*tile*.06);ctx.lineTo(cx+dx*tile*.5-dy*tile*.06,cy+dy*tile*.5-dx*tile*.06);ctx.stroke();
      const jx=cx+dx*tile*.33,jy=cy+dy*tile*.33;ctx.fillStyle='#bf7846';ctx.fillRect(jx-tile*(dx?.04:.16),jy-tile*(dy?.04:.16),tile*(dx?.08:.32),tile*(dy?.08:.32));
    }
    ctx.fillStyle=mode==='normal'?'#6e8588':waterCss(e.waterTemperature,1);ctx.fillRect(cx-tile*.115,cy-tile*.115,tile*.23,tile*.23);
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

  waterChiller(ctx,world,e,x,y,tile,mode,time){
    this.equipmentPorts(ctx,world,e,x,y,tile,mode,time);
    const active=(e.coolingPower||0)>100,glow=active?Math.min(1,(e.coolingPower||0)/(e.ratedCapacity||80000)):0;
    ctx.fillStyle='#14283a';ctx.strokeStyle=active?'#22d3ee':'#64748b';ctx.lineWidth=Math.max(1,tile*.06);
    ctx.fillRect(x+tile*.12,y+tile*.13,tile*.76,tile*.74);ctx.strokeRect(x+tile*.12,y+tile*.13,tile*.76,tile*.74);
    ctx.fillStyle='#1e3a5f';ctx.fillRect(x+tile*.2,y+tile*.22,tile*.6,tile*.22);
    ctx.strokeStyle='#7dd3fc';ctx.lineWidth=Math.max(1,tile*.035);for(let i=0;i<4;i++){const fx=x+tile*(.25+i*.15);ctx.beginPath();ctx.moveTo(fx,y+tile*.25);ctx.lineTo(fx,y+tile*.41);ctx.stroke();}
    ctx.strokeStyle='#38bdf8';ctx.lineWidth=Math.max(1,tile*.045);ctx.beginPath();ctx.arc(x+tile*.5,y+tile*.65,tile*.16,0,Math.PI*2);ctx.stroke();
    ctx.save();ctx.translate(x+tile*.5,y+tile*.65);if(active&&time>0)ctx.rotate(time*4);ctx.fillStyle='#67e8f9';for(let i=0;i<3;i++){ctx.rotate(Math.PI*2/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(tile*.13,-tile*.035);ctx.lineTo(tile*.07,tile*.08);ctx.closePath();ctx.fill();}ctx.restore();
    ctx.fillStyle=e.powerBlocked?'#fb7185':active?'#34d399':e.enabled===false?'#64748b':'#fbbf24';ctx.beginPath();ctx.arc(x+tile*.79,y+tile*.2,tile*.045,0,Math.PI*2);ctx.fill();
    if(active&&mode!=='thermal'){ctx.fillStyle=`rgba(56,189,248,${.08+glow*.12})`;ctx.fillRect(x+tile*.17,y+tile*.45,tile*.66,tile*.08);}
  }
}
