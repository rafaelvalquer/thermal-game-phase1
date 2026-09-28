import { createVisualScene,createTechnicianScene } from './visualScene.js';
import { Renderer } from '../rendering/Renderer.js';
import { Camera } from '../rendering/Camera.js';
import { SPRITES } from '../rendering/sprites/SpriteManifest.js';
const canvas=document.querySelector('#scene'),camera=new Camera(),renderer=new Renderer(canvas,camera,{tilePixels:32});
let world,sim,sceneUpdate=null,paused=false,speed=1,last=performance.now(),zoomIndex=0;
function populate(dense=false){
  const scene=createVisualScene(dense);world=scene.world;sim=scene.sim;renderer.zones=scene.zones;sceneUpdate=null;
  camera.zoom=dense?.45:1;camera.x=0;camera.y=0;renderer.selectedEntity=null;
}
populate();await renderer.preloadSprites();
const technicianButton=document.createElement('button');technicianButton.textContent='Técnicos · 4 vistas';document.querySelector('header').append(technicianButton);
technicianButton.onclick=()=>{const scene=createTechnicianScene();world=scene.world;sim=scene.sim;sceneUpdate=scene.update;renderer.zones=[];camera.zoom=1;camera.x=0;camera.y=0;renderer.selectedEntity=null;document.querySelector('p').textContent='Colunas: costas / direita / frente / esquerda. Linhas: repouso / caminhada / manutenção. Clique para selecionar.';};
document.querySelector('#mode').onchange=e=>renderer.mode=e.target.value;
document.querySelector('#pause').onclick=e=>{paused=!paused;e.target.textContent=paused?'Continuar':'Pausar';};
document.querySelector('#speed').onclick=e=>{speed=speed===1?4:1;e.target.textContent='Velocidade '+speed+'×';};
document.querySelector('#zoom').onclick=()=>{camera.zoom=[.35,1,2.4][zoomIndex++%3];};
document.querySelector('#dense').onclick=()=>populate(true);
document.querySelector('#bench').onclick=()=>{
  const times=[];for(let i=0;i<140;i++){const t=performance.now();renderer.draw(world,sim);if(i>=20)times.push(performance.now()-t);}
  times.sort((a,b)=>a-b);document.querySelector('#result').textContent=`${world.entities.length} equipamentos · média ${(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2)} ms · p95 ${times[114].toFixed(2)} ms (somente renderização)`;
};
canvas.onclick=e=>{const r=canvas.getBoundingClientRect(),p=camera.screenToWorld(e.clientX-r.left,e.clientY-r.top);renderer.selectedEntity=world.entities.find(e=>e.type==='technician'&&Math.abs((e.fromX+(e.toX-e.fromX)*e.moveProgress+.5)*32-p.x)<20&&Math.abs((e.fromY+(e.toY-e.fromY)*e.moveProgress+.5)*32-p.y)<20)||world.entityAt(Math.floor(p.x/32),Math.floor(p.y/32));};
for(const [id,definition] of Object.entries(SPRITES)){
  const figure=document.createElement('figure'),sample=document.createElement('canvas');sample.width=definition.frameWidth;sample.height=64;sample.style.width=(definition.frameWidth*2)+'px';
  const ctx=sample.getContext('2d');ctx.imageSmoothingEnabled=false;renderer.entities.sprites.manager.draw(ctx,id,0,0,0,sample.width,64);
  const label=document.createElement('figcaption');label.textContent=id;figure.append(sample,label);document.querySelector('#gallery').append(figure);
}
function frame(now){if(!paused)sim.visualTime+=Math.min(.1,(now-last)/1000)*speed;last=now;sceneUpdate?.(sim.visualTime);renderer.draw(world,sim);requestAnimationFrame(frame);}requestAnimationFrame(frame);
