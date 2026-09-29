import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { World } from '../../src/world/World.js';
import { Simulation } from '../../src/simulation/Simulation.js';
import { TileRenderer } from '../../src/rendering/TileRenderer.js';
import { EntityRenderer } from '../../src/rendering/EntityRenderer.js';
import { SPRITES,spriteIdFor,spriteIconStyle } from '../../src/rendering/sprites/SpriteManifest.js';
import { SpriteAnimator } from '../../src/rendering/sprites/SpriteAnimator.js';
import { SpriteAtlas } from '../../src/rendering/sprites/SpriteAtlas.js';
import { EquipmentSpriteRenderer } from '../../src/rendering/sprites/EquipmentSpriteRenderer.js';
import { getVisualState } from '../../src/rendering/sprites/SpriteDefinition.js';
import { TOOL_SPRITE_ICONS } from '../../src/ui/Toolbar.js';

test('operational visual clock follows physics speed and freezes while paused',()=>{
  const sim=new Simulation(new World(4,4),{objectives:[],failures:[],events:[],missionDuration:999,thermalSystems:{simpleCooling:false,waterCooling:false}});sim.initialize();
  sim.update(.1);assert.equal(sim.visualTime,.1);
  sim.paused=true;sim.update(1);assert.equal(sim.visualTime,.1);
  sim.paused=false;sim.setSpeed(4);sim.update(.1);assert.equal(sim.visualTime,.5);
});
test('all generated pixel art stays on the integer grid with separate idle rows',async()=>{
  for(const s of Object.values(SPRITES)){
    const svg=await readFile('public'+s.path,'utf8');
    assert.ok(!/<(?:path|circle|ellipse|filter|linearGradient|radialGradient)\b/.test(svg),s.id);
    const groups=[...svg.matchAll(/<g[^>]*>(.*?)<\/g>/g)].map(m=>m[1]);
    assert.equal(groups.length,s.frames*s.rows,s.id);
    // Technicians have directional breathing cycles; stopped equipment is static.
    const idleRows=s.id==='technician'?new Set():new Set([s.stateRows.idle]);
    for(const row of idleRows)assert.ok(groups.slice(row*s.frames,(row+1)*s.frames).every(g=>g===groups[row*s.frames]),'idle row is static: '+s.id);
    for(const [,n] of svg.matchAll(/\s(?:x|y|width|height)="([^"]+)"/g))assert.equal(Number(n)%1,0,s.id);
  }
});
test('model icons and state rows use manifest dimensions',()=>{
  assert.equal(spriteIdFor({type:'coolingUnit',tier:'compact'}),'coolingCompact');
  assert.equal(spriteIdFor({type:'coolingUnit',tier:'industrial'}),'coolingIndustrial');
  assert.match(spriteIconStyle({type:'pump'}),/--sprite-columns:6;--sprite-rows:2/);
  assert.deepEqual(new SpriteAtlas().sourceRect('coolingIndustrial',2,'blocked'),{x:256,y:64,width:128,height:64});
});
test('solar artwork and icons expose an active reflection and a static inactive row',async()=>{
  const sprite=SPRITES.solarPanel,svg=await readFile('public'+sprite.path,'utf8');
  const frames=[...svg.matchAll(/<g[^>]*>(.*?)<\/g>/g)].map(match=>match[1]);
  assert.equal(sprite.frames,4);assert.equal(sprite.rows,2);
  assert.equal(new Set(frames.slice(0,4)).size,4,'reflection travels across the panel');
  assert.equal(new Set(frames.slice(4)).size,1,'night and off states stay static');
  assert.equal(TOOL_SPRITE_ICONS.solarPanel,'power/solar_panel.svg');
  assert.match(spriteIconStyle({type:'solarPanel'}),/--sprite-columns:4;--sprite-rows:2/);
});
test('solar sprite follows actual generation, pause and reduced motion',()=>{
  const sprite=SPRITES.solarPanel,animator=new SpriteAnimator(),panel={id:'solar-test',type:'solarPanel',enabled:true,peakPowerW:2000,generationW:0};
  assert.equal(animator.fpsFor(panel,sprite),0);assert.equal(getVisualState(panel),'idle');
  panel.generationW=200;const low=animator.fpsFor(panel,sprite);assert.equal(getVisualState(panel),'running');
  panel.generationW=2000;assert.ok(animator.fpsFor(panel,sprite)>low);
  const frame=animator.frameFor(panel,sprite,4.5);assert.equal(animator.frameFor(panel,sprite,4.5),frame,'paused visual time keeps the frame fixed');
  assert.equal(new SpriteAnimator({reduceMotion:()=>true}).frameFor(panel,sprite,4.5),0);
  panel.enabled=false;assert.equal(animator.fpsFor(panel,sprite),0);assert.equal(getVisualState(panel),'off');
  panel.enabled=true;panel.powerBlocked=true;assert.equal(animator.fpsFor(panel,sprite),0);assert.equal(getVisualState(panel),'critical');
});
test('power cuts and invalid circulation select stopped machinery',()=>{
  const animator=new SpriteAnimator();
  for(const type of ['serverRack','fan','pump','coolingUnit'])assert.equal(animator.fpsFor({type,enabled:true,powerBlocked:true,flowRate:1,currentVelocity:2,currentAirFlow:2},SPRITES[type]),0);
  assert.equal(animator.fpsFor({type:'pump',flowRate:1,circuitClosed:false},SPRITES.pump),0);
  assert.equal(animator.fpsFor({type:'tank',flowRate:0},SPRITES.tank),0);
  const states=[],renderer=new EquipmentSpriteRenderer({manager:{get:()=>({}),draw(...args){states.push(args.at(-1));return true;}},effects:{drawShadow(){},drawThermalGlow(){},drawState(){}},ports:{draw(){}}});
  const ctx={save(){},restore(){},translate(){},rotate(){}};
  renderer.draw(ctx,{}, {type:'serverRack',x:0,y:0,powerBlocked:true},32,'normal',8);
  assert.deepEqual(states,['blocked']);assert.equal(ctx.imageSmoothingEnabled,false);
});
test('visible tile bounds discard the rest of a large map and wall masks connect',()=>{
  const world=new World(100,100),renderer=new TileRenderer(),calls=[];world.setMaterial(2,2,'concrete');world.setMaterial(3,2,'concrete');
  renderer.tile=(...args)=>calls.push(args);
  renderer.draw({},world,32,[],'normal',{x:64,y:64,width:32,height:32});
  assert.ok(calls.length<=9);const walls=calls.filter(c=>c[1]==='concrete');assert.equal(walls.length,2);assert.ok(walls[0][4]&2);assert.ok(walls[1][4]&8);
});
test('offscreen equipment is not submitted to the sprite renderer',()=>{
  const renderer=new EntityRenderer(),seen=[];renderer.sprites={visualFootY:()=>.8,draw(_ctx,_w,e){seen.push(e.id);return true;},isAnimated:()=>false};
  renderer.draw({}, {entities:[{id:'near',x:1,y:1,type:'sensor'},{id:'far',x:99,y:99,type:'sensor'}]},32,'normal',0,{bounds:{x:0,y:0,width:100,height:100}});
  assert.deepEqual(seen,['near']);
});

test('rack airflow orientation is rasterized once per tile and direction pair',()=>{
  const previous=globalThis.OffscreenCanvas,arrowCalls=[];
  class Canvas{constructor(width,height){this.width=width;this.height=height;}getContext(){return{set imageSmoothingEnabled(_value){},save(){},restore(){},beginPath(){arrowCalls.push('path');},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},set strokeStyle(_value){},set fillStyle(_value){},set lineWidth(_value){}};}}
  globalThis.OffscreenCanvas=Canvas;
  try{
    const renderer=new EntityRenderer(),drawn=[];
    const ctx={drawImage(...args){drawn.push(args);},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},set strokeStyle(_value){},set fillStyle(_value){},set lineWidth(_value){}};
    const rack={x:1,y:2,airIntakeDirection:{x:0,y:-1},airExhaustDirection:{x:0,y:1}};
    renderer.rackOrientation(ctx,rack,14);renderer.rackOrientation(ctx,{...rack,x:3},14);
    assert.equal(renderer.rackOrientationCanvases.size,1);
    assert.equal(arrowCalls.length,4,'two arrow paths are built once, then reused');
    assert.equal(drawn.length,2,'each rack uses one cached overlay image');
  }finally{if(previous===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=previous;}
});

test('inspection scene renders every overlay, selection and zoom without runtime errors',async()=>{
  const {createVisualScene}=await import('../../src/dev/visualScene.js');
  const {Renderer}=await import('../../src/rendering/Renderer.js');
  const {Camera}=await import('../../src/rendering/Camera.js');
  const {world,sim,zones}=createVisualScene();
  const gradient={addColorStop(){}},ctx=new Proxy({measureText:t=>({width:String(t).length*6}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>target[key]??(()=>{}),set:(target,key,value)=>(target[key]=value,true)});
  const previous=globalThis.devicePixelRatio;globalThis.devicePixelRatio=1;
  try{
    const canvas={width:800,height:600,getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:600})};
    const camera=new Camera(),renderer=new Renderer(canvas,camera);renderer.zones=zones;
    for(const key of Object.keys(SPRITES))renderer.entities.sprites.manager.images.set(key,{});
    for(const mode of ['normal','thermal','airflow','pressure','fluid','cooling'])for(const zoom of [.35,1,2.4]){
      camera.zoom=zoom;renderer.mode=mode;renderer.selectedEntity=world.entities.find(e=>e.type===(mode==='fluid'?'pump':mode==='cooling'?'coolingUnit':'serverRack'));
      assert.doesNotThrow(()=>renderer.draw(world,sim),mode+' '+zoom);
    }
  }finally{if(previous===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previous;}
});
