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
import { BUILD_CATALOG, STRUCTURE_TOOLS } from '../building/BuildCatalog.js';
import { clamp } from '../utils/MathUtils.js';
import { entityFootprintCells } from '../entities/EntityFootprint.js';
import { DUCT_TOOLS } from '../building/PlacementValidator.js';
import { CoolingDuctRenderer } from './cooling/CoolingDuctRenderer.js';
import { CoolingFlowRenderer } from './cooling/CoolingFlowRenderer.js';
import { CoolingOverlayRenderer } from './cooling/CoolingOverlayRenderer.js';
import { CoolingUnitRenderer } from './cooling/CoolingUnitRenderer.js';
import { CoolingAirExchange } from '../simulation/cooling/CoolingAirExchange.js';
import { ViewportCulling } from './ViewportCulling.js';
import { StaticMapCache } from './StaticMapCache.js';
import { VisualQualityManager } from './VisualQualityManager.js';

export class Renderer {
  constructor(canvas,camera,{tilePixels=14,monitor=null}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.camera=camera;this.tile=tilePixels;
    this.monitor=monitor;
    this.mode='normal';this.debug=false;this.hover=null;this.buildSystem=null;this.selectedEntity=null;this.highlightedContractId=null;this.level=null;
    this.tileRenderer=new TileRenderer();this.heatmap=new HeatmapRenderer();this.airflow=new AirflowRenderer();this.pressure=new PressureRenderer();
    this.staticMap=new StaticMapCache();
    this.entities=new EntityRenderer();this.effects=new EffectsRenderer();
    this.coolingDucts=new CoolingDuctRenderer();this.coolingFlow=new CoolingFlowRenderer();this.coolingOverlay=new CoolingOverlayRenderer();this.coolingUnits=new CoolingUnitRenderer();
    this.coolingFlow.monitor=monitor;this.coolingFlow.geometryCache.monitor=monitor;
    this.distortionBuffer=new ThermalDistortionBuffer();this.heatHaze=new HeatHazeRenderer({quality:VisualSettings.heatHazeQuality,maxRegions:VisualSettings.maxHazeRegions});
    this.visualQuality=new VisualQualityManager();
  }

  resize(){
    const dpr=Math.min(2,devicePixelRatio||1),r=this.canvas.getBoundingClientRect(),w=Math.max(1,Math.floor(r.width*dpr)),h=Math.max(1,Math.floor(r.height*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.dpr=dpr;
  }

  draw(world,simulation){
    this.monitor?.begin('renderMs');
    this.resize();
    const ctx=this.ctx,time=VisualSettings.reduceMotion?0:(simulation.visualTime??0),uiTime=VisualSettings.reduceMotion?0:performance.now()/1000;
    const width=this.canvas.width/this.dpr,height=this.canvas.height/this.dpr;

    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.imageSmoothingEnabled=false;
    ctx.clearRect(0,0,width,height);
    const bg=ctx.createLinearGradient(0,0,0,height);
    bg.addColorStop(0,'#253239');bg.addColorStop(1,'#10191e');
    ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);

    const renderDirect=this.mode==='thermal'||!VisualSettings.heatHaze;
    const bounds={x:this.camera.x,y:this.camera.y,width:width/this.camera.zoom,height:height/this.camera.zoom};
    if(renderDirect||this.distortionBuffer.ensure(width,height,this.dpr)){
      const scene=renderDirect?ctx:this.distortionBuffer.context();
      scene.save();
      scene.scale(this.camera.zoom,this.camera.zoom);
      scene.translate(-this.camera.x,-this.camera.y);
      scene.imageSmoothingEnabled=false;
      this.monitor?.begin('renderTilesMs');
      if(this.mode==='normal')this.staticMap.draw(scene,world,this.tile,this.zones||[],this.tileRenderer,bounds);
      else this.tileRenderer.draw(scene,world,this.tile,this.zones||[],this.mode,bounds);
      this.monitor?.end('renderTilesMs');
      // Draw utility ducts before equipment so a hydraulic pipe crossing this
      // tile remains visually on top without joining the air network.
      if(this.mode!=='thermal'){this.monitor?.begin('renderDuctsMs');this.coolingDucts.draw(scene,world,this.tile,this.mode,this.camera.zoom,bounds);this.monitor?.end('renderDuctsMs');this.monitor?.set('renderedDucts',this.coolingDucts.stats?.renderedDucts||0);}
      // Put the thermal field above duct linework so rack temperatures remain
      // legible where ducts cross the heatmap. Equipment sprites stay on top.
      if(this.mode==='thermal'){this.monitor?.begin('renderDuctsMs');this.coolingDucts.draw(scene,world,this.tile,this.mode,this.camera.zoom,bounds);this.monitor?.end('renderDuctsMs');}
      if(this.mode==='thermal')this.monitor?.set('renderedDucts',this.coolingDucts.stats?.renderedDucts||0);
      if(this.mode==='thermal'){this.monitor?.begin('renderHeatmapMs');this.heatmap.draw(scene,world,this.tile,bounds,this.camera.zoom,uiTime);this.monitor?.end('renderHeatmapMs');}
      this.monitor?.begin('renderEntitiesMs');
      this.entities.draw(scene,world,this.tile,this.mode,time,{selectedEntity:this.selectedEntity,bounds,zoom:this.camera.zoom,deferThermalIndicators:this.mode==='thermal'});
      this.monitor?.end('renderEntitiesMs');
      if(this.mode!=='cooling')this.coolingDucts.drawOutletConnections(scene,world,this.tile,time,this.camera.zoom,bounds);
      this.monitor?.set('visibleEntities',this.entities.stats?.visibleEntities||0);this.monitor?.set('totalEntities',world.entities.length);
      this.monitor?.set('staticEntities',this.entities.staticEntities.length);this.monitor?.set('dynamicEntities',this.entities.dynamicEntities.length);
      this.monitor?.begin('renderEffectsMs');
      this.effects.draw(scene,world,this.tile,this.mode,time,bounds);
      this.monitor?.end('renderEffectsMs');
      if(this.buildSystem?.selected)this.drawBuildPreview(scene,world,uiTime);
      this.drawRecentPlacement(scene,uiTime);
      scene.restore();

      if(!renderDirect){
        const allowHeatHaze=VisualSettings.heatHaze&&this.mode!=='pressure'&&this.heatHaze.maxRegions>0;
        if(allowHeatHaze)this.heatHaze.render(ctx,this.distortionBuffer.canvas,world,this.camera,this.tile,this.mode,time,width,height,this.dpr);
        else ctx.drawImage(this.distortionBuffer.canvas,0,0,this.distortionBuffer.canvas.width,this.distortionBuffer.canvas.height,0,0,width,height);
      }
    }

    ctx.save();
    ctx.scale(this.camera.zoom,this.camera.zoom);
    ctx.translate(-this.camera.x,-this.camera.y);
    this.drawZones(ctx);
    if(this.mode==='pressure')this.pressure.draw(ctx,world,this.tile,bounds);
    if(this.mode==='fluid'){this.monitor?.begin('fluidRenderMs');this.drawFluidNetwork(ctx,world,time,this.selectedEntity,this.camera.zoom,bounds);this.monitor?.end('fluidRenderMs');}
    if(this.mode==='cooling'&&simulation.cooling){
      this.coolingOverlay.draw(ctx,world,this.tile,time,this.camera.zoom,this.selectedEntity,bounds);
      this.coolingFlow.draw(ctx,simulation.cooling.networks,this.tile,time,this.camera.zoom,this.selectedEntity,bounds);
      const viewport=ViewportCulling.fromBounds(bounds,this.tile,2);for(const unit of simulation.cooling.units)if(viewport.contains(unit.x,unit.y))this.coolingUnits.draw(ctx,unit,this.tile,this.camera.zoom);
      this.coolingDucts.drawOutletConnections(ctx,world,this.tile,time,this.camera.zoom,bounds);
    }
    if(this.mode==='airflow'){
      this.airflow.draw(ctx,world,this.tile,time,this.camera.zoom,bounds);
      this.drawFocusedAirflow(ctx,world,time);
    }
    this.drawFailureAlerts(ctx,world,simulation,time);
    this.drawEventHighlight(ctx,world,simulation,time);
    this.drawContractRackHighlights(ctx,world,time);
    this.drawSelection(ctx);
    this.drawTechnicianRoute(ctx,world);
    if(this.selectedEntity?.type==='supplyVent')this.drawVentCoverage(ctx,world,this.selectedEntity);
    if(this.selectedEntity?.type==='exchanger'){
      const machine=world.getEntityById(this.selectedEntity.machineId)||this.adjacentHeatMachine(world,this.selectedEntity.x,this.selectedEntity.y);
      if(machine)this.outlineEntity(ctx,machine,'#fb923c',time,1.2);
    }
    this.drawHover(ctx,world,uiTime);
    if(this.debug)this.drawDebug(ctx,world);
    ctx.restore();

    // Rack temperature labels are the final world layer, above ducts and overlays.
    if(this.mode==='thermal'){
      this.monitor?.begin('renderThermalLabelsMs');
      ctx.save();ctx.scale(this.camera.zoom,this.camera.zoom);ctx.translate(-this.camera.x,-this.camera.y);
      this.entities.drawThermalIndicators(ctx,this.tile,{selectedEntity:this.selectedEntity,zoom:this.camera.zoom});
      ctx.restore();this.monitor?.end('renderThermalLabelsMs');
    }
    this.drawSelectionCard(ctx,simulation,width,height);
    this.drawEventBanner(ctx,simulation,width);
    this.drawLegend(ctx,simulation,width);
    if(this.debug)this.drawVisualPhysicsDebug(ctx,time,world,simulation.metrics);
    if(this.debug)this.drawPerformanceOverlay(ctx);
    if(this.monitor){const settings=this.visualQuality.update(this.monitor.currentFps());this.heatHaze.quality=settings.quality;this.heatHaze.maxRegions=settings.maxRegions;this.heatHaze.detector.maxRegions=settings.maxRegions;}
    this.monitor?.end('renderMs');
  }

  drawPerformanceOverlay(ctx){
    const p=this.monitor?.snapshot({includePercentiles:true});if(!p)return;
    const n=value=>Number(value||0).toFixed(1),lines=['PERFORMANCE',`FPS p50/p95low   ${n(p.fpsP50)} / ${n(p.fpsP95Low)}`,`Frame p50/p95    ${n(p.frameTimeP50)} / ${n(p.frameTimeP95)} ms`,`Long/severe      ${p.longFrameCount.toFixed(1)} / ${p.severeFrameCount.toFixed(1)} per sec`,`Simulation       ${n(p.simulationMs)} ms`,` Physics ticks   ${n(p.physicsSubstepsAvg)} avg / ${p.physicsSubstepsMax} max`,` Backlog/dropped ${n(p.physicsBacklogSeconds)} s / ${p.physicsDroppedSeconds.toFixed(1)}s/s`,` Airflow         ${n(p.airflowMs)} ms`,` Pressure        ${n(p.pressureMs)} ms`,`  iterations     ${n(p.pressureIterationsAvg)} avg / ${p.pressureIterationsMax} max`,`  early exits    ${n(p.pressureEarlyExitPercent)}%`,` Cooling         ${n(p.coolingMs)} ms`,`  control        ${p.coolingControlUpdates.toFixed(1)}/s`,`  prepare        ${n(p.coolingPrepareMs)} ms`,`  exchange       ${n(p.coolingExchangeMs)} ms`,`  vent coverage  ${n(p.ventCoverageMs)} ms`,`  partial recalc ${n(p.coolingPartialRecalcCount)}/s`,` Thermal         ${n(p.thermalMs)} ms`,`  statistics     ${n(p.thermalStatsMs)} ms`,`  conduct        ${n(p.thermalConductMs)} ms`,` Racks           ${n(p.rackMs)} ms`,` Staff           ${n(p.technicianDispatchMs)} ms`,`  pathfinding    ${n(p.technicianPathfindingMs)} ms`,`  patrol rebuild ${n(p.patrolGraphRebuildCount)}/s`,` Fluid           ${n(p.fluidMs)} ms`,`  transport      ${n(p.fluidTransportMs)} ms`,`  render         ${n(p.fluidRenderMs)} ms`,`  hydraulic      ${n(p.hydraulicSolveMs)} ms`,` Power snapshot  ${n(p.powerSnapshotMs)} ms`,` Energy/account  ${n(p.energyAccountingMs)} ms`,` Render          ${n(p.renderMs)} ms`,`  tiles ${n(p.renderTilesMs)} · heatmap ${n(p.renderHeatmapMs)} · ducts ${n(p.renderDuctsMs)}`,`  entities ${n(p.renderEntitiesMs)} · effects ${n(p.renderEffectsMs)} · labels ${n(p.renderThermalLabelsMs)}`,`  fluid links ${p.renderedFluidLinks}`,` UI              ${n(p.uiMs)} ms`,`  graphs         ${n(p.uiGraphMs)} ms`,` Save            ${n(p.saveMs)} ms`,`  bytes          ${p.saveBytes}`,`Entities visible ${p.visibleEntities} / ${p.totalEntities} · static ${p.staticEntities} · dynamic ${p.dynamicEntities}`,`Pressure solves  ${p.pressureSolveCount.toFixed(1)}/s`,`Cooling rebuilds ${p.coolingRebuildCount.toFixed(1)}/s`,`Cooling prepares ${p.coolingPrepareCount.toFixed(1)}/s`,`Plan reuse       ${p.coolingFrameReuseCount.toFixed(1)}/s`,`Vent geometry    ${p.ventCoverageCalculationCount.toFixed(1)}/s`,`Staff dispatches ${p.technicianDispatchCount.toFixed(1)}/s`,`Paths calculated ${p.pathsCalculated.toFixed(1)}/s`,`Hydraulic solves ${p.hydraulicSolveCount.toFixed(1)}/s`,`Thermal topology ${p.thermalTopologyRebuildCount.toFixed(1)}/s`,`Fluid rebuilds   ${p.fluidRebuildCount.toFixed(1)}/s`];
    lines.splice(3,0,`Loop work/update ${n(p.gameLoopWorkMs)} / ${n(p.gameLoopUpdateMs)} ms · ${n(p.gameLoopUpdates)} updates/s`);
    lines.splice(4,0,`GC ${p.gcSupported?`${n(p.gcCount)}/s · ${n(p.gcMs)} ms`:'indisponível'} · heap ${p.heapUsedBytes==null?'n/d':(p.heapUsedBytes/1048576).toFixed(1)+' MB'} · quedas ${n(p.heapDropCount)}/s`);
    const x=this.canvas.width/this.dpr-234,y=18,w=220,h=lines.length*12+12;ctx.save();ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle='rgba(2,6,23,.92)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='rgba(71,85,105,.8)';ctx.strokeRect(x+.5,y+.5,w-1,h-1);ctx.font='9px ui-monospace,monospace';lines.forEach((line,index)=>{ctx.fillStyle=index===0?'#67e8f9':'#cbd5e1';ctx.fillText(line,x+7,y+13+index*12);});ctx.restore();
  }

  preloadSprites(){return this.entities.preloadSprites();}

  drawBuildPreview(ctx,world,time){
    const p=this.hover,tool=this.buildSystem.selected;
    if(tool==='demolish'&&this.demolishSelection){
      const {start,end}=this.demolishSelection,x=Math.min(start.x,end.x),y=Math.min(start.y,end.y),width=Math.abs(end.x-start.x)+1,height=Math.abs(end.y-start.y)+1;
      ctx.save();ctx.fillStyle='rgba(239,68,68,.22)';ctx.strokeStyle='#fb7185';ctx.lineWidth=Math.max(1.5,2/this.camera.zoom);ctx.setLineDash([5/this.camera.zoom,3/this.camera.zoom]);
      ctx.fillRect(x*this.tile,y*this.tile,width*this.tile,height*this.tile);ctx.strokeRect(x*this.tile,y*this.tile,width*this.tile,height*this.tile);ctx.setLineDash([]);
      ctx.font='900 '+Math.max(8,10/this.camera.zoom)+'px ui-monospace,monospace';ctx.textAlign='left';ctx.textBaseline='bottom';ctx.fillStyle='#fecaca';ctx.fillText('REMOVER · '+width+' × '+height,(x*this.tile)+3,(y*this.tile)-3);ctx.restore();return;
    }
    if(!p||(!world.inBounds(p.x,p.y)&&tool!=='pipe'&&!DUCT_TOOLS.has(tool)))return;
    const pipePath=tool==='pipe'?this.pipePreview?.():null;
    const utilityPath=DUCT_TOOLS.has(tool)?this.pipePreview?.():null;
    const structurePath=STRUCTURE_TOOLS.has(tool)?this.pipePreview?.():null;
    if(utilityPath?.length&&DUCT_TOOLS.has(tool)){
      const plan=this.buildSystem.utilityPlacement.planPath(tool,utilityPath,{inventory:this.buildSystem.inventory[tool]??0,budget:this.buildSystem.budget,cost:BUILD_CATALOG[tool].cost});
      for(const point of plan.entries){
        if(point.connect)continue;
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
    if(structurePath?.length){
      let remaining=this.buildSystem.inventory[tool]??0,budget=this.buildSystem.budget;
      const material=world.registry.get(BUILD_CATALOG[tool].material),cost=BUILD_CATALOG[tool].cost;
      for(const point of structurePath){
        const valid=remaining>0&&budget>=cost&&this.buildSystem.canPlace(tool,point.x,point.y);
        if(world.inBounds(point.x,point.y)){
          ctx.save();ctx.globalAlpha=valid?.5:.2;
          this.tileRenderer.material(ctx,material,point.x,point.y,point.x*this.tile,point.y*this.tile,this.tile);
          ctx.restore();
        }
        ctx.save();ctx.fillStyle=valid?'rgba(34,197,94,.1)':'rgba(239,68,68,.14)';ctx.strokeStyle=valid?'#4ade80':'#f87171';
        ctx.lineWidth=Math.max(1,1.6/this.camera.zoom);
        ctx.fillRect(point.x*this.tile,point.y*this.tile,this.tile,this.tile);
        ctx.strokeRect(point.x*this.tile+1,point.y*this.tile+1,this.tile-2,this.tile-2);ctx.restore();
        if(valid){remaining--;budget-=cost;}
      }
      return;
    }
    const valid=this.buildSystem.canPlace(tool,p.x,p.y)&&this.buildSystem.canAfford(tool),c=BUILD_CATALOG[tool];
    if(c?.kind==='material'){
      ctx.save();ctx.globalAlpha=valid?.48:.24;
      this.tileRenderer.material(ctx,world.registry.get(c.material),p.x,p.y,p.x*this.tile,p.y*this.tile,this.tile);
      ctx.restore();
    }else if(DUCT_TOOLS.has(tool)){
      this.coolingDucts.preview(ctx,p.x,p.y,this.tile,tool,valid,this.camera.zoom,{embedded:!world.isAir(p.x,p.y)});
    }
    else this.entities.drawPreview(ctx,world,tool,p.x,p.y,this.buildSystem.direction(),this.tile,this.mode,time,valid,tool==='coolingUnit'?this.buildSystem.coolingUnitModel:null);

    if(tool==='supplyVent')this.drawVentCoverage(ctx,world,{x:p.x,y:p.y,direction:this.buildSystem.direction()},{preview:true});

    if(tool==='exchanger'){
      const machine=this.adjacentHeatMachine(world,p.x,p.y);
      if(machine)this.outlineEntity(ctx,machine,'#fb923c',time,1.2);
    }
    ctx.save();ctx.fillStyle=valid?'rgba(34,197,94,.1)':'rgba(239,68,68,.14)';ctx.strokeStyle=valid?'#4ade80':'#f87171';
    ctx.lineWidth=Math.max(1,1.6/this.camera.zoom);
    for(const cell of this.buildSystem.placementCells(tool,p.x,p.y)){
      ctx.fillRect(cell.x*this.tile,cell.y*this.tile,this.tile,this.tile);
      ctx.strokeRect(cell.x*this.tile+1,cell.y*this.tile+1,this.tile-2,this.tile-2);
    }
    ctx.restore();
  }

  drawVentCoverage(ctx,world,vent,{preview=false}={}){
    const exchange=world.coolingSystem?.exchange||new CoolingAirExchange(world,null),cells=exchange.supplyCells(vent),served=exchange.serviceRacks(vent),intakes=new Set(served.map(item=>world.index(item.x,item.y)));
    if(!cells.length)return;
    ctx.save();ctx.globalAlpha=preview ? .55 : .72;
    for(const cell of cells){
      const x=cell.x*this.tile,y=cell.y*this.tile,index=world.index(cell.x,cell.y),target=intakes.has(index);
      ctx.fillStyle=target?'rgba(34,211,238,.34)':'rgba(56,189,248,.12)';ctx.strokeStyle=target?'#67e8f9':'rgba(125,211,252,.55)';ctx.lineWidth=Math.max(1,1.3/this.camera.zoom);
      ctx.fillRect(x+1,y+1,this.tile-2,this.tile-2);ctx.strokeRect(x+1,y+1,this.tile-2,this.tile-2);
    }
    for(const item of served){
      const x=(item.x+.5)*this.tile,y=(item.y+.5)*this.tile;
      ctx.fillStyle='#cffafe';ctx.strokeStyle='#0891b2';ctx.lineWidth=Math.max(1,1.5/this.camera.zoom);
      ctx.beginPath();ctx.arc(x,y,this.tile*.16,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    const d=vent.direction||{x:0,y:1};
    for(let step=1;step<=3;step++){
      const x=vent.x+d.x*step,y=vent.y+d.y*step;
      if(!world.inBounds(x,y))break;
      if(world.isAir(x,y))continue;
      const px=(x+.5)*this.tile,py=(y+.5)*this.tile,size=this.tile*.28;
      ctx.globalAlpha=.9;ctx.fillStyle='rgba(127,29,29,.72)';ctx.strokeStyle='#fb7185';ctx.lineWidth=Math.max(1.2,1.5/this.camera.zoom);
      ctx.fillRect(x*this.tile+1,y*this.tile+1,this.tile-2,this.tile-2);ctx.strokeRect(x*this.tile+1,y*this.tile+1,this.tile-2,this.tile-2);
      ctx.beginPath();ctx.moveTo(px-size,py-size);ctx.lineTo(px+size,py+size);ctx.moveTo(px+size,py-size);ctx.lineTo(px-size,py+size);ctx.stroke();break;
    }
    ctx.restore();
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

  drawContractRackHighlights(ctx,world,time){
    if(!this.highlightedContractId)return;
    for(const rack of world.entities)if(rack.type==='serverRack'&&rack.contractId===this.highlightedContractId)this.outlineEntity(ctx,rack,'#38bdf8',time,1.55);
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

  drawFluidNetwork(ctx,world,time,selected=this.selectedEntity,zoom=this.camera.zoom||1,bounds=null){
    const networks=world.fluidNetworks||world.fluidSystem?.networks||[],viewport=bounds?ViewportCulling.fromBounds(bounds,this.tile,2):null;
    const selectingFluid=Boolean(selected&&FLUID_TYPES.has(selected.type)),selectedNetwork=selectingFluid?selected.networkId:null;
    let renderedLinks=0;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';

    for(const network of networks){
      if(viewport&&network.bounds&&(network.bounds.maxX<viewport.minX||network.bounds.minX>viewport.maxX||network.bounds.maxY<viewport.minY||network.bounds.minY>viewport.maxY))continue;
      const topologyLinks=network.edges||network.links||this.fluidTopologyLinks(network);
      for(const link of topologyLinks){
      const a=link.a||link.from,b=link.b||link.to;
      if(!a||!b||viewport&&(!viewport.contains(a.x,a.y)||!viewport.contains(b.x,b.y)))continue;
      renderedLinks++;
      const ax=(a.x+.5)*this.tile,ay=(a.y+.5)*this.tile,bx=(b.x+.5)*this.tile,by=(b.y+.5)*this.tile;
      const valid=a.circuitClosed&&b.circuitClosed&&a.networkId===b.networkId;
      const t=((a.waterTemperature??25)+(b.waterTemperature??25))/2;
      const focused=!selectingFluid||(selectedNetwork?(a.networkId===selectedNetwork||b.networkId===selectedNetwork):(a===selected||b===selected));

      ctx.globalAlpha=focused?1:.14;
      ctx.strokeStyle=valid?'rgba(15,23,42,.9)':'rgba(69,26,3,.88)';
      ctx.lineWidth=this.tile*.45;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
      ctx.strokeStyle=valid?waterCss(t,.95):'rgba(251,113,133,.88)';
      ctx.lineWidth=this.tile*.22;ctx.stroke();

      const flowLinks=a.flowLinks||[],flowLink=link.from&&link.to?link:flowLinks.find(item=>(item.from===a&&item.to===b)||(item.from===b&&item.to===a));
      let from=flowLink?.from||null,to=flowLink?.to||null,edgeFlow=flowLink?.flowRate||0;
      if(!flowLink&&a.downstreamId===b.id){from=a;to=b;edgeFlow=a.flowRate||0;}
      else if(!flowLink&&b.downstreamId===a.id){from=b;to=a;edgeFlow=b.flowRate||0;}

      if(valid&&from&&edgeFlow>.02){
        const fx=(from.x+.5)*this.tile,fy=(from.y+.5)*this.tile,tx=(to.x+.5)*this.tile,ty=(to.y+.5)*this.tile;
        const angle=Math.atan2(ty-fy,tx-fx),size=Math.max(4.5,this.tile*.2)/Math.max(.25,zoom),count=Math.max(2,Math.min(5,Math.ceil(edgeFlow*1.35))),speed=.65+Math.min(2.2,edgeFlow*.65);
        ctx.fillStyle=waterCss(t,.98);
        for(let particle=0;particle<count;particle++){
          const phase=(time*speed+from.id*.137+particle/count)%1,px=fx+(tx-fx)*phase,py=fy+(ty-fy)*phase;
          ctx.save();ctx.translate(px,py);ctx.rotate(angle);ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=size*.8;
          ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.72,-size*.62);ctx.lineTo(-size*.48,0);ctx.lineTo(-size*.72,size*.62);ctx.closePath();ctx.fill();
          ctx.shadowBlur=0;ctx.strokeStyle='rgba(224,242,254,.95)';ctx.lineWidth=Math.max(.8,size*.16);ctx.stroke();
          ctx.globalAlpha*=.58;ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=Math.max(1,size*.22);ctx.beginPath();ctx.moveTo(-size*.88,0);ctx.lineTo(-size*1.65,0);ctx.stroke();ctx.restore();
        }
      }
      ctx.globalAlpha=1;
      }
    }
    for(const network of networks){
      if(viewport&&network.bounds&&(network.bounds.maxX<viewport.minX||network.bounds.minX>viewport.maxX||network.bounds.maxY<viewport.minY||network.bounds.minY>viewport.maxY))continue;
      for(const e of network.entities){
      if(viewport&&!viewport.contains(e.x,e.y))continue;
      const neighborCount=(network.neighbors.get(e.id)||[]).length;
      const focused=!selectingFluid||(selectedNetwork?e.networkId===selectedNetwork:e===selected);
      const fault=e.networkStatus&&e.networkStatus!=='CLOSED';
      const isOpenEnd=neighborCount<2;
      const isJunction=neighborCount>2;
      const needsAttention=(e.type==='pump'&&(!e.circuitClosed||(e.flowRate||0)<.02))||((e.type==='pipe'||e.type==='radiator'||e.type==='exchanger'||e.type==='tank')&&(isOpenEnd||(isJunction&&!e.circuitClosed)));
      if(!needsAttention)continue;
      const x=(e.x+.5)*this.tile,y=(e.y+.5)*this.tile-this.tile*.28;
      ctx.globalAlpha=focused?1:.16;ctx.fillStyle='#7f1d1d';ctx.strokeStyle=fault?'#fb7185':'#fbbf24';ctx.lineWidth=Math.max(1,1/zoom);
      ctx.beginPath();ctx.arc(x,y,this.tile*.18,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff7ed';ctx.font='900 '+Math.max(7,this.tile*.22)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',x,y);
      }
    }
    if(selectingFluid&&selected?.circuitClosed&&selected.flowRate>0){
      const input=Number(selected.inletTemperature??selected.waterTemperature??25),output=Number(selected.outletTemperature??selected.waterTemperature??input);
      const exchanged=Math.abs(Number(selected.thermalPower)||selected.flowRate*4186*Math.abs(output-input));
      const x=(selected.x+.5)*this.tile,y=selected.y*this.tile-this.tile*.55,label=`IN ${input.toFixed(1)}°  ·  Q ${(exchanged/1000).toFixed(1)} kW  ·  OUT ${output.toFixed(1)}°`;
      ctx.save();ctx.font='700 '+Math.max(8,this.tile*.25)+'px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';const width=(ctx.measureText?.(label)?.width||label.length*Math.max(8,this.tile*.25)*.62)+this.tile*.35,height=Math.max(15,this.tile*.46);
      ctx.globalAlpha=1;ctx.fillStyle='rgba(2,6,23,.94)';ctx.fillRect(x-width/2,y-height/2,width,height);ctx.strokeStyle='#38bdf8';ctx.lineWidth=Math.max(1,1/zoom);ctx.strokeRect(x-width/2,y-height/2,width,height);ctx.fillStyle='#e0f2fe';ctx.fillText(label,x,y);ctx.restore();
    }
    ctx.globalAlpha=1;ctx.restore();this.monitor?.set('renderedFluidLinks',renderedLinks);
  }

  fluidTopologyLinks(network){
    const links=[];
    for(const a of network.entities||[])for(const b of network.neighbors?.get(a.id)||[])if(a.id<b.id)links.push({a,b});
    return links;
  }

  drawSelection(ctx){
    const e=this.selectedEntity;if(!e)return;
    const cells=entityFootprintCells(e),minX=Math.min(...cells.map(cell=>cell.x)),maxX=Math.max(...cells.map(cell=>cell.x)),minY=Math.min(...cells.map(cell=>cell.y)),maxY=Math.max(...cells.map(cell=>cell.y)),x=minX*this.tile,y=minY*this.tile,w=(maxX-minX+1)*this.tile,h=(maxY-minY+1)*this.tile,pulse=VisualSettings.reduceMotion ? .7 : .5+.5*Math.sin(performance.now()/180);
    ctx.save();ctx.strokeStyle='rgba(250,204,21,'+(.55+pulse*.35)+')';ctx.lineWidth=Math.max(1.2,2/this.camera.zoom);
    ctx.setLineDash([this.tile*.18,this.tile*.12]);ctx.strokeRect(x-this.tile*.12,y-this.tile*.12,w+this.tile*.24,h+this.tile*.24);ctx.setLineDash([]);ctx.restore();
  }

  drawTechnicianRoute(ctx,world){
    const worker=this.selectedEntity;
    if(worker?.type!=='technician'||worker.action!=='moving'||worker.targetRackId==null)return false;
    const rack=world.getEntityById?.(worker.targetRackId)||world.entities.find(entity=>entity.type==='serverRack'&&entity.id===worker.targetRackId);
    if(!rack)return false;
    const tile=this.tile,progress=Math.max(0,Math.min(1,worker.moveProgress||0));
    const current={x:((worker.fromX??worker.x)+((worker.toX??worker.x)-(worker.fromX??worker.x))*progress+.5)*tile,y:((worker.fromY??worker.y)+((worker.toY??worker.y)-(worker.fromY??worker.y))*progress+.5)*tile};
    const points=[current,...(worker.path||[]).slice(worker.pathIndex||0).map(point=>({x:(point.x+.5)*tile,y:(point.y+.5)*tile}))];
    if(!points.length)return false;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='rgba(34,211,238,.95)';ctx.lineWidth=Math.max(2.2,2.6/(this.camera.zoom||1));ctx.setLineDash([tile*.22,tile*.14]);ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(const point of points.slice(1))ctx.lineTo(point.x,point.y);ctx.stroke();ctx.setLineDash([]);
    const goal=points.at(-1);ctx.fillStyle='#67e8f9';ctx.strokeStyle='#082f49';ctx.lineWidth=Math.max(1,1/(this.camera.zoom||1));ctx.beginPath();ctx.arc(goal.x,goal.y,Math.max(3,tile*.13),0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(251,146,60,.96)';ctx.lineWidth=Math.max(2,2/(this.camera.zoom||1));ctx.setLineDash([tile*.13,tile*.1]);ctx.strokeRect(rack.x*tile+1,rack.y*tile+1,tile-2,tile-2);ctx.setLineDash([]);ctx.restore();return true;
  }

  adjacentHeatMachine(world,x,y){
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const entity=world.entityAt(x+dx,y+dy);if(entity?.isHeatMachine)return entity;}
    return null;
  }

  drawHover(ctx,world,time){
    if(!this.hover||!world.inBounds(this.hover.x,this.hover.y))return;
    const x=this.hover.x,y=this.hover.y,selected=this.buildSystem?.selected;
    if(STRUCTURE_TOOLS.has(selected)&&this.pipePreview?.()?.length)return;
    const valid=selected?this.buildSystem.canPlace(selected,x,y)&&this.buildSystem.canAfford(selected):true,pulse=VisualSettings.reduceMotion ? .7 : .5+.5*Math.sin(time*5);
    ctx.save();ctx.fillStyle=selected?(valid?'rgba(34,197,94,.09)':'rgba(239,68,68,.12)'):'rgba(248,250,252,.025)';
    const previewCells=selected?this.buildSystem.placementCells(selected,x,y):[{x,y}];
    for(const cell of previewCells)ctx.fillRect(cell.x*this.tile,cell.y*this.tile,this.tile,this.tile);
    ctx.strokeStyle=selected?(valid?'#4ade80':'#f87171'):'#f8fafc';ctx.globalAlpha=.72+pulse*.25;ctx.lineWidth=Math.max(1,2/this.camera.zoom);
    for(const cell of previewCells)ctx.strokeRect(cell.x*this.tile+1,cell.y*this.tile+1,this.tile-2,this.tile-2);ctx.globalAlpha=1;
    if(selected&&['fan','exhaust','pump','radiator','supplyVent','coolingUnit','industrialCoolingUnit'].includes(selected)){
      const d=this.buildSystem.direction(),cx=(x+.5)*this.tile,cy=(y+.5)*this.tile;
      const distance=['pump','radiator'].includes(selected)?this.tile*1.4:this.tile*4;
      const spread=['pump','radiator'].includes(selected)?this.tile*.28:this.tile*.9;
      ctx.fillStyle='rgba(14,165,233,.07)';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+d.x*distance-d.y*spread,cy+d.y*distance+d.x*spread);ctx.lineTo(cx+d.x*distance+d.y*spread,cy+d.y*distance-d.x*spread);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#7dd3fc';ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+d.x*(distance*.85),cy+d.y*(distance*.85));ctx.stroke();
    }
    if(selected==='exchanger'){
      const machine=this.adjacentHeatMachine(world,x,y);
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
