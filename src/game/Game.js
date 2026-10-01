import { LevelManager } from '../campaign/LevelManager.js';
import { Simulation } from '../simulation/Simulation.js';
import { BuildSystem } from '../building/BuildSystem.js';
import { Camera } from '../rendering/Camera.js';
import { Renderer } from '../rendering/Renderer.js';
import { InputManager } from '../input/InputManager.js';
import { MouseController } from '../input/MouseController.js';
import { UIManager } from '../ui/UIManager.js';
import { GameLoop } from './GameLoop.js';
import { clamp } from '../utils/MathUtils.js';
import { extendPipePath } from '../building/PipePath.js';
import { STRUCTURE_TOOLS } from '../building/BuildCatalog.js';
import { DUCT_TOOLS } from '../building/PlacementValidator.js';
import { DataCenterManager } from '../datacenter/DataCenterManager.js';
import { DataCenterSaveSystem } from '../datacenter/DataCenterSaveSystem.js';
import { TechnicianSystem } from '../simulation/TechnicianSystem.js';
import { technicianAt } from '../entities/Technician.js';
import { PerformanceMonitor } from '../performance/PerformanceMonitor.js';
import { BrowserPerformanceBenchmark } from '../dev/BrowserPerformanceBenchmark.js';
import { DirtyStateTracker } from '../bridge/DirtyStateTracker.js';
import { WorldSnapshot } from '../bridge/WorldSnapshot.js';
import { GameAudio } from '../audio/GameAudio.js';

export class Game {
  constructor(canvas,level,campaign,{saveSystem=null}={}){
    this.canvas=canvas;this.level=level.datacenterSandbox?{...level,powerLimit:level.datacenter.powerCapacityKW*1000}:level;this.campaign=campaign;
    this.levelManager=new LevelManager();this.world=this.levelManager.load(this.level);
    const benchmarkSaveSystem=this.level.performanceBenchmarkSave?new DataCenterSaveSystem({key:'thermal-lab-performance-benchmark-save-v1'}):undefined;
    const activeSaveSystem=saveSystem||benchmarkSaveSystem;
    this.datacenter=this.level.datacenterSandbox?new DataCenterManager(this.world,this.level,activeSaveSystem?{saveSystem:activeSaveSystem}:{}):null;
    if(this.datacenter)this.level.powerLimit=this.datacenter.powerGrid.capacityKW*1000;
    this.performance=new PerformanceMonitor();this.sim=new Simulation(this.world,this.level,{monitor:this.performance});
    this.browserBenchmark=this.level.performanceBenchmark?new BrowserPerformanceBenchmark(this.level.performanceBenchmark,this.performance):null;
    this.build=new BuildSystem(this.world,this.sim,{budget:this.datacenter?.cash??this.level.budget,inventory:this.level.inventory});
    this.staff=new TechnicianSystem(this.world,this.build);this.staff.monitor=this.performance;this.world.technicianSystem=this.staff;this.sim.technicians=this.staff;
    if(this.datacenter)this.staff.payrollDay=this.datacenter.state.lastSettledDay||0;
    this.datacenter?.attach(this.build,this.sim);
    this.audio=new GameAudio();
    this.audioGesture=()=>{this.audio.unlock();document.removeEventListener('pointerdown',this.audioGesture,true);document.removeEventListener('keydown',this.audioGesture,true);};
    document.addEventListener('pointerdown',this.audioGesture,true);document.addEventListener('keydown',this.audioGesture,true);
    this.camera=new Camera();this.renderer=new Renderer(canvas,this.camera,{monitor:this.performance});this.renderer.buildSystem=this.build;this.renderer.zones=this.level.zones||[];this.renderer.level=this.level;
    this.viewMode='2d';this.threeView=null;this.threeViewPromise=null;this.disposed=false;this.worldViewBridge=new DirtyStateTracker();this.worldViewBridge.observe(this.world);this.worldSnapshot=null;this.worldSnapshotElapsed=Infinity;this.viewCanvas=canvas;
    if(this.datacenter)this.datacenter.monitor=this.performance;
    this.assetsReady=this.renderer.preloadSprites();
    this.input=new InputManager(canvas);this.mouse=new MouseController(canvas,this.camera,this.renderer.tile);this.hover={x:0,y:0};
    this.setupInput();this.sim.initialize();this.ui=new UIManager(this,campaign);this.setSpeed(1);
    document.querySelector('#benchmarkDownload')?.addEventListener('click',()=>this.browserBenchmark?.download());
    this.camera.setBounds(this.datacenter?.land?this.ui.cameraLandBounds():{x:0,y:0,width:this.world.width*this.renderer.tile,height:this.world.height*this.renderer.tile});this.centerCamera();
    this.loop=new GameLoop(dt=>this.update(dt),()=>this.render(),{monitor:this.performance});
  }

  setupInput(){
    this.pipeDrag=null;this.demolishDrag=null;
    this.renderer.pipePreview=()=>this.pipeDrag?.path||null;
    this.mouse.onMove=grid=>{this.hover=grid;this.renderer.hover=grid;if(this.pipeDrag)this.pipeDrag.path=extendPipePath(this.pipeDrag.path,grid);if(this.demolishDrag){this.demolishDrag.end={...grid};this.renderer.demolishSelection=this.demolishDrag;}};
    this.mouse.onPrimaryDown=grid=>{this.audio?.unlock?.();if(this.ui?.landPanel?.mode||technicianAt(this.world,grid.x,grid.y))return;if(this.build.selected==='demolish'){this.demolishDrag={start:{...grid},end:{...grid}};this.renderer.demolishSelection=this.demolishDrag;return;}if(this.build.selected==='pipe'||DUCT_TOOLS.has(this.build.selected)||STRUCTURE_TOOLS.has(this.build.selected))this.pipeDrag={path:[{x:grid.x,y:grid.y}],tool:this.build.selected};};
    this.mouse.onPrimary=grid=>{
      if(!this.world.inBounds(grid.x,grid.y))return;
      if(this.ui?.landPanel?.mode){if(!this.ui.selectLandAt(grid.x,grid.y))this.toast('Esta área não faz parte de uma expansão.');return;}
      if(technicianAt(this.world,grid.x,grid.y)){this.ui?.inspectAt(grid.x,grid.y);return;}
      if(this.build.selected==='demolish')return;
      if(this.build.selected==='pipe'||DUCT_TOOLS.has(this.build.selected)||STRUCTURE_TOOLS.has(this.build.selected))return;
      if(this.build.selected){const r=this.build.place(grid.x,grid.y);if(!r.ok)this.toast(r.reason);else this.audio.playBuild();}
      else this.ui?.inspectAt(grid.x,grid.y);
    };
    this.mouse.onPrimaryUp=grid=>{
      if(this.demolishDrag){
        this.demolishDrag.end={...grid};const selection=this.demolishDrag,result=this.build.demolishArea(selection.start,selection.end);
        this.demolishDrag=null;this.renderer.demolishSelection=null;
        if(result.ok){const money=(this.datacenter?'R$ ':'$ ')+Math.round(result.refund).toLocaleString('pt-BR'),skipped=result.blocked?' · '+result.blocked+' protegido(s) pela missão':'';this.toast(result.removed+' itens removidos · reembolso '+money+skipped);}
        else if(result.blocked)this.toast(result.blocked+' item(ns) protegido(s) pela missão');
        return;
      }
      if(!this.pipeDrag)return;
      this.pipeDrag.path=extendPipePath(this.pipeDrag.path,grid);
      const tool=this.pipeDrag.tool;
      const result=tool==='pipe'?this.build.placePipePath(this.pipeDrag.path):DUCT_TOOLS.has(tool)?this.build.placeDuctPath(this.pipeDrag.path):this.build.placeStructurePath(this.pipeDrag.path);
      this.pipeDrag=null;
      if(result.placed>0)this.audio.playBuild();
      if(result.failed)this.toast(`${result.placed} ${STRUCTURE_TOOLS.has(tool)?'blocos':'trechos'} instalados; ${result.failed} posição(ões) ignorada(s)`);
    };
    this.mouse.onSecondary=()=>{this.pipeDrag=null;this.demolishDrag=null;this.renderer.demolishSelection=null;if(this.ui?.landPanel?.mode){this.ui.landPanel.setMode(false);return;}this.build.select(null);};
    addEventListener('keydown',e=>{
      if(window.__thermalLab!==this)return;
      if(e.repeat)return;
      this.audio.unlock();
      if(this.viewMode!=='2d'){
        if(e.code==='Space'){e.preventDefault();this.sim.togglePause();}
        return;
      }
      if(e.code==='Space'){e.preventDefault();this.sim.togglePause();}
      if(e.code==='KeyR')this.build.rotate();
      if(e.code==='KeyI'&&DUCT_TOOLS.has(this.build.selected))this.toast('Isolamento: '+(this.build.toggleDuctInsulation()?'ativado':'padrão'));
      if(e.code==='KeyM'&&this.build.selected==='coolingUnit'){const model=this.build.cycleCoolingUnitModel();this.toast('Modelo '+model.label+' · '+(model.ratedCoolingCapacity/1000)+' kW · $'+model.cost);}
      if(e.code==='KeyM'&&this.build.selected?.startsWith('computeRack')){const model=this.build.cycleComputeRackModel();const capacity=model.specialization==='cpu'?model.capacity.vcpu+' vCPU · '+model.capacity.ramGB+' GB RAM':model.specialization==='gpu'?model.capacity.gpuCount+' GPUs · '+model.capacity.vramPerGpuGB+' GB/GPU':model.capacity.storageTB+' TB';this.toast('Modelo '+model.label+' · '+capacity+' · '+(model.maxPowerW/1000)+' kW · R$ '+model.cost.toLocaleString('pt-BR'));}
      if(e.code==='F3'){e.preventDefault();this.renderer.debug=!this.renderer.debug;}
      if(e.code==='Escape'){this.pipeDrag=null;this.demolishDrag=null;this.renderer.demolishSelection=null;if(this.ui?.landPanel?.mode)this.ui.landPanel.setMode(false);else this.build.select(null);}
      if(['Digit1','Digit2','Digit4','Digit8'].includes(e.code))this.setSpeed(Number(e.code.at(-1)));
    });
  }

  centerCamera(){
    const r=this.canvas.getBoundingClientRect(),tile=this.renderer.tile,b=this.datacenter?.land?.bounds({margin:2})||{x:0,y:0,width:this.world.width,height:this.world.height},worldW=b.width*tile,worldH=b.height*tile;
    const fit=Math.min(r.width/worldW,r.height/worldH);
    this.camera.zoom=clamp(fit*.92,.45,1.15);
    this.camera.x=b.x*tile+Math.max(0,(worldW-r.width/this.camera.zoom)/2);
    this.camera.y=b.y*tile+Math.max(0,(worldH-r.height/this.camera.zoom)/2);
  }

  setSpeed(v){this.sim.setSpeed(v);this.ui?.setSpeedButtons(v);}

  update(dt){
    if(this.viewMode==='2d'){
      this.updateCameraFocus(dt);
      const speed=360*dt;
      if(this.input.down('KeyW'))this.camera.move(0,-speed);
      if(this.input.down('KeyS'))this.camera.move(0,speed);
      if(this.input.down('KeyA'))this.camera.move(-speed,0);
      if(this.input.down('KeyD'))this.camera.move(speed,0);
      const r=this.canvas.getBoundingClientRect();this.camera.constrain(r.width,r.height);
    }
    this.sim.update(dt);this.audio.update(this.sim);this.performance.begin('uiMs');this.ui?.update(dt);this.performance.end('uiMs');this.datacenter?.updateAutoSave(dt);
    if(this.viewMode!=='2d'){
      this.worldSnapshotElapsed+=dt;this.worldViewBridge.observe(this.world);
      if(!this.worldSnapshot||this.worldViewBridge.isDirty()||this.worldSnapshotElapsed>=.2){
        this.worldSnapshot=WorldSnapshot.capture(this.world,this.sim,this.datacenter,{version:this.worldViewBridge.version});
        this.worldViewBridge.setSnapshot(this.worldSnapshot);this.worldSnapshotElapsed=0;
      }
    }
  }

  render(){
    if(this.viewMode==='2d')this.renderer.draw(this.world,this.sim);
    else if(this.threeView)this.threeView.update(this.worldSnapshot||WorldSnapshot.capture(this.world,this.sim,this.datacenter,{version:this.worldViewBridge.version}),1/60);
    const report=this.browserBenchmark?.frame();
    if(report){
      const output=document.querySelector('#benchmarkOutput'),download=document.querySelector('#benchmarkDownload');
      if(output)output.textContent=`${report.elapsedSeconds}s · ${report.sampledFrames} quadros\nFPS p50 ${report.fpsP50.toFixed(1)} · FPS p95 baixo ${report.fpsP95Low.toFixed(1)}\nQuadro p50/p95 ${report.frameTimeP50.toFixed(1)} / ${report.frameTimeP95.toFixed(1)} ms\nLoop ${report.gameLoopWorkMs.toFixed(1)} ms · updates ${report.gameLoopUpdateMs.toFixed(1)} ms · ${report.gameLoopUpdates.toFixed(1)} atualizações/s\nSimulação ${report.simulationMs.toFixed(1)} ms · render ${report.renderMs.toFixed(1)} ms · UI ${report.uiMs.toFixed(1)} ms\nRender: mapa ${report.renderTilesMs.toFixed(1)} · heatmap ${report.renderHeatmapMs.toFixed(1)} · dutos ${report.renderDuctsMs.toFixed(1)} ms\nRender: entidades ${report.renderEntitiesMs.toFixed(1)} · efeitos ${report.renderEffectsMs.toFixed(1)} · labels ${report.renderThermalLabelsMs.toFixed(1)} ms\nEntidades ${report.visibleEntities}/${report.totalEntities} · dutos ${report.renderedDucts} · links fluido ${report.renderedFluidLinks}\nQuadros longos/graves ${report.longFrameCount.toFixed(1)} / ${report.severeFrameCount.toFixed(1)} por segundo\nBacklog de física ${report.physicsBacklogSeconds.toFixed(2)} s`;
      if(output){const gc=report.gcSupported?`${report.gcCount.toFixed(1)} eventos/s · ${report.gcMs.toFixed(1)} ms`:'GC sem suporte do navegador',heap=report.heapUsedBytes==null?'n/d':(report.heapUsedBytes/1048576).toFixed(1)+' MB',saveSize=report.saveBytesEstimated?'B estimados':'B';output.textContent+=`\n${gc} · heap ${heap} · quedas ${report.heapDropCount.toFixed(1)}/s · save/quadro ${report.saveMs.toFixed(2)} ms · evento p50/p95/máx ${report.saveDurationP50Ms.toFixed(1)}/${report.saveDurationP95Ms.toFixed(1)}/${report.saveDurationMaxMs.toFixed(1)} ms · captura ${report.saveCaptureMs.toFixed(1)} ms (estado/tiles/entidades/utilidades/build ${report.saveStateMs.toFixed(1)}/${report.saveTilesMs.toFixed(1)}/${report.saveEntitiesMs.toFixed(1)}/${report.saveUtilitiesMs.toFixed(1)}/${report.saveBuildMs.toFixed(1)}) · JSON/storage ${report.saveSerializeMs.toFixed(1)}/${report.saveStorageMs.toFixed(1)} ms (${report.saveEventsPerSec.toFixed(2)}/s, ${report.saveBytes} ${saveSize}) · paths ${report.coolingPathAllocations.toFixed(1)}/s`;}
      if(download)download.disabled=false;
    }
  }

  focusThermalEntity(entity){
    if(!entity)return false;
    this.ui?.inspectEntity(entity,entity.x,entity.y);
    if(this.viewMode!=='2d')this.setViewMode('2d');
    const rect=this.canvas.getBoundingClientRect(),tile=this.renderer.tile,targetZoom=clamp(Math.min(rect.width,rect.height)/(tile*7),.85,1.65),worldX=(entity.x+.5)*tile,worldY=(entity.y+.5)*tile;
    this.cameraFocus={fromX:this.camera.x,fromY:this.camera.y,fromZoom:this.camera.zoom,targetZoom,targetX:worldX-rect.width/(2*targetZoom),targetY:worldY-rect.height/(2*targetZoom),elapsed:0,duration:.65};
    return true;
  }

  updateCameraFocus(dt){
    const motion=this.cameraFocus;if(!motion)return;
    motion.elapsed=Math.min(motion.duration,motion.elapsed+dt);const p=motion.elapsed/motion.duration,eased=1-Math.pow(1-p,3);
    this.camera.x=motion.fromX+(motion.targetX-motion.fromX)*eased;this.camera.y=motion.fromY+(motion.targetY-motion.fromY)*eased;this.camera.zoom=motion.fromZoom+(motion.targetZoom-motion.fromZoom)*eased;
    if(p>=1)this.cameraFocus=null;
  }

  setViewMode(mode){
    const next=mode==='walk'?'walk':'2d';
    if(next==='2d'){
      this.viewMode='2d';this.canvas.hidden=false;this.threeView?.setVisible(false);this.canvas.focus?.();return true;
    }
    if(!this.level.datacenterSandbox){this.toast('A visualização 3D está disponível no Data Center Sandbox.');return false;}
    if(!this.threeView)return this.ensureThreeView().then(created=>{
      if(!created||this.disposed)return false;
      this.activateThreeView(next);return true;
    });
    this.activateThreeView(next);return true;
  }

  async ensureThreeView(){
    if(this.threeView)return true;
    if(this.threeViewPromise)return this.threeViewPromise;
    this.threeViewPromise=import('../rendering/three/ThreeView.js').then(({ThreeView})=>{
      if(this.disposed)return false;
      const host=document.querySelector('.viewport-wrap');
      this.worldSnapshot=WorldSnapshot.capture(this.world,this.sim,this.datacenter,{version:this.worldViewBridge.version});this.worldViewBridge.setSnapshot(this.worldSnapshot);this.worldSnapshotElapsed=0;
        this.threeView=new ThreeView(host,{world:this.world,simulation:this.sim,datacenter:this.datacenter,snapshot:this.worldSnapshot,onMessage:message=>this.toast(message),onSelect:(runtimeId,record)=>{
        const entity=this.world.getEntityById?.(Number(runtimeId))||this.world.entities?.find(item=>String(item.id)===String(runtimeId));
        if(entity)this.ui?.inspectEntity(entity,record?.x||0,record?.y||0);else if(record)this.ui?.inspectEntity(null,record.x,record.y);
      }});
      return !this.threeView.error;
    }).catch(error=>{this.toast('Falha ao carregar a visualização 3D: '+error.message);return false;});
    const result=await this.threeViewPromise;this.threeViewPromise=null;return result;
  }

  activateThreeView(next){
    this.viewMode=next;this.canvas.hidden=true;this.threeView.setMode(next);this.threeView.setVisible(true);
    if(this.worldSnapshot)this.threeView.update(this.worldSnapshot,1/60);
  }

  dispose(){this.disposed=true;this.loop?.stop();document.removeEventListener('pointerdown',this.audioGesture,true);document.removeEventListener('keydown',this.audioGesture,true);this.audio?.dispose?.();this.threeView?.dispose();this.threeView=null;}

  toast(text){
    const t=document.querySelector('#toast');if(!t)return;t.textContent=text;t.classList.add('show');
    clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.remove('show'),1400);
  }

  async start(){await this.assetsReady;if(window.__thermalLab===this)this.loop.start();}
}
