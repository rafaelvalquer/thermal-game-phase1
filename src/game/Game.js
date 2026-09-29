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
import { TechnicianSystem } from '../simulation/TechnicianSystem.js';
import { technicianAt } from '../entities/Technician.js';
import { PerformanceMonitor } from '../performance/PerformanceMonitor.js';

export class Game {
  constructor(canvas,level,campaign){
    this.canvas=canvas;this.level=level.datacenterSandbox?{...level,powerLimit:level.datacenter.powerCapacityKW*1000}:level;this.campaign=campaign;
    this.levelManager=new LevelManager();this.world=this.levelManager.load(this.level);
    this.datacenter=this.level.datacenterSandbox?new DataCenterManager(this.world,this.level):null;
    if(this.datacenter)this.level.powerLimit=this.datacenter.powerGrid.capacityKW*1000;
    this.performance=new PerformanceMonitor();this.sim=new Simulation(this.world,this.level,{monitor:this.performance});
    this.build=new BuildSystem(this.world,this.sim,{budget:this.datacenter?.cash??this.level.budget,inventory:this.level.inventory});
    this.staff=new TechnicianSystem(this.world,this.build);this.staff.monitor=this.performance;this.world.technicianSystem=this.staff;this.sim.technicians=this.staff;
    if(this.datacenter)this.staff.payrollDay=this.datacenter.state.lastSettledDay||0;
    this.datacenter?.attach(this.build,this.sim);
    this.camera=new Camera();this.renderer=new Renderer(canvas,this.camera,{monitor:this.performance});this.renderer.buildSystem=this.build;this.renderer.zones=this.level.zones||[];this.renderer.level=this.level;
    if(this.datacenter)this.datacenter.monitor=this.performance;
    this.assetsReady=this.renderer.preloadSprites();
    this.input=new InputManager(canvas);this.mouse=new MouseController(canvas,this.camera,this.renderer.tile);this.hover={x:0,y:0};
    this.setupInput();this.sim.initialize();this.ui=new UIManager(this,campaign);this.setSpeed(1);this.centerCamera();
    this.camera.setBounds(this.world.width*this.renderer.tile,this.world.height*this.renderer.tile);
    this.loop=new GameLoop(dt=>this.update(dt),()=>this.render());
  }

  setupInput(){
    this.pipeDrag=null;this.demolishDrag=null;
    this.renderer.pipePreview=()=>this.pipeDrag?.path||null;
    this.mouse.onMove=grid=>{this.hover=grid;this.renderer.hover=grid;if(this.pipeDrag)this.pipeDrag.path=extendPipePath(this.pipeDrag.path,grid);if(this.demolishDrag){this.demolishDrag.end={...grid};this.renderer.demolishSelection=this.demolishDrag;}};
    this.mouse.onPrimaryDown=grid=>{if(technicianAt(this.world,grid.x,grid.y))return;if(this.build.selected==='demolish'){this.demolishDrag={start:{...grid},end:{...grid}};this.renderer.demolishSelection=this.demolishDrag;return;}if(this.build.selected==='pipe'||DUCT_TOOLS.has(this.build.selected)||STRUCTURE_TOOLS.has(this.build.selected))this.pipeDrag={path:[{x:grid.x,y:grid.y}],tool:this.build.selected};};
    this.mouse.onPrimary=grid=>{
      if(!this.world.inBounds(grid.x,grid.y))return;
      if(technicianAt(this.world,grid.x,grid.y)){this.ui?.inspectAt(grid.x,grid.y);return;}
      if(this.build.selected==='demolish')return;
      if(this.build.selected==='pipe'||DUCT_TOOLS.has(this.build.selected)||STRUCTURE_TOOLS.has(this.build.selected))return;
      if(this.build.selected){const r=this.build.place(grid.x,grid.y);if(!r.ok)this.toast(r.reason);}
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
      if(result.failed)this.toast(`${result.placed} ${STRUCTURE_TOOLS.has(tool)?'blocos':'trechos'} instalados; ${result.failed} posição(ões) ignorada(s)`);
    };
    this.mouse.onSecondary=()=>{this.pipeDrag=null;this.demolishDrag=null;this.renderer.demolishSelection=null;this.build.select(null);};
    addEventListener('keydown',e=>{
      if(window.__thermalLab!==this)return;
      if(e.repeat)return;
      if(e.code==='Space'){e.preventDefault();this.sim.togglePause();}
      if(e.code==='KeyR')this.build.rotate();
      if(e.code==='KeyI'&&DUCT_TOOLS.has(this.build.selected))this.toast('Isolamento: '+(this.build.toggleDuctInsulation()?'ativado':'padrão'));
      if(e.code==='KeyM'&&this.build.selected==='coolingUnit'){const model=this.build.cycleCoolingUnitModel();this.toast('Modelo '+model.label+' · '+(model.ratedCoolingCapacity/1000)+' kW · $'+model.cost);}
      if(e.code==='F3'){e.preventDefault();this.renderer.debug=!this.renderer.debug;}
      if(e.code==='Escape'){this.pipeDrag=null;this.demolishDrag=null;this.renderer.demolishSelection=null;this.build.select(null);}
      if(['Digit1','Digit2','Digit4','Digit8'].includes(e.code))this.setSpeed(Number(e.code.at(-1)));
    });
  }

  centerCamera(){
    const r=this.canvas.getBoundingClientRect(),worldW=this.world.width*this.renderer.tile,worldH=this.world.height*this.renderer.tile;
    const fit=Math.min(r.width/worldW,r.height/worldH);
    this.camera.zoom=clamp(fit*.92,.45,1.15);
    this.camera.x=Math.max(0,(worldW-r.width/this.camera.zoom)/2);
    this.camera.y=Math.max(0,(worldH-r.height/this.camera.zoom)/2);
  }

  setSpeed(v){this.sim.setSpeed(v);this.ui?.setSpeedButtons(v);}

  update(dt){
    const speed=360*dt;
    if(this.input.down('KeyW'))this.camera.move(0,-speed);
    if(this.input.down('KeyS'))this.camera.move(0,speed);
    if(this.input.down('KeyA'))this.camera.move(-speed,0);
    if(this.input.down('KeyD'))this.camera.move(speed,0);
    const r=this.canvas.getBoundingClientRect();this.camera.constrain(r.width,r.height);
    this.sim.update(dt);this.performance.begin('uiMs');this.ui?.update(dt);this.performance.end('uiMs');this.datacenter?.updateAutoSave(dt);
  }

  render(){this.renderer.draw(this.world,this.sim);}

  toast(text){
    const t=document.querySelector('#toast');if(!t)return;t.textContent=text;t.classList.add('show');
    clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.remove('show'),1400);
  }

  async start(){await this.assetsReady;if(window.__thermalLab===this)this.loop.start();}
}
