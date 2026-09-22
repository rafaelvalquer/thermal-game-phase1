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

export class Game {
  constructor(canvas,level,campaign){
    this.canvas=canvas;this.level=level;this.campaign=campaign;
    this.levelManager=new LevelManager();this.world=this.levelManager.load(level);
    this.sim=new Simulation(this.world,level);
    this.build=new BuildSystem(this.world,this.sim,{budget:level.budget,inventory:level.inventory});
    this.camera=new Camera();this.renderer=new Renderer(canvas,this.camera);this.renderer.buildSystem=this.build;this.renderer.zones=level.zones||[];
    this.input=new InputManager(canvas);this.mouse=new MouseController(canvas,this.camera,this.renderer.tile);this.hover={x:0,y:0};
    this.setupInput();this.sim.initialize();this.ui=new UIManager(this,campaign);this.setSpeed(1);this.centerCamera();
    this.camera.setBounds(this.world.width*this.renderer.tile,this.world.height*this.renderer.tile);
    this.loop=new GameLoop(dt=>this.update(dt),()=>this.render());
  }

  setupInput(){
    this.mouse.onMove=grid=>{this.hover=grid;this.renderer.hover=grid;};
    this.mouse.onPrimary=grid=>{
      if(!this.world.inBounds(grid.x,grid.y))return;
      if(this.build.selected){const r=this.build.place(grid.x,grid.y);if(!r.ok)this.toast(r.reason);}
      else this.ui?.inspectAt(grid.x,grid.y);
    };
    this.mouse.onSecondary=()=>this.build.select(null);
    addEventListener('keydown',e=>{
      if(e.repeat)return;
      if(e.code==='Space'){e.preventDefault();this.sim.togglePause();}
      if(e.code==='KeyR')this.build.rotate();
      if(e.code==='F3'){e.preventDefault();this.renderer.debug=!this.renderer.debug;}
      if(e.code==='Escape')this.build.select(null);
      if(['Digit1','Digit2','Digit4'].includes(e.code))this.setSpeed(Number(e.code.at(-1)));
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
    this.sim.update(dt);this.ui?.update(dt);
  }

  render(){this.renderer.draw(this.world,this.sim);}

  toast(text){
    const t=document.querySelector('#toast');if(!t)return;t.textContent=text;t.classList.add('show');
    clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.remove('show'),1400);
  }

  start(){this.loop.start();}
}
