import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionEventSystem } from '../../src/campaign/MissionEventSystem.js';
import { Renderer } from '../../src/rendering/Renderer.js';
import { World } from '../../src/world/World.js';
import { OUTDOOR_TEMP } from '../../src/utils/Constants.js';

test('Phase 6 events have an eight-second presentation window; other levels retain six',()=>{
  const world=new World(2,2),event={time:1,type:'machineLoad'};
  const phaseSix=new MissionEventSystem(world,{number:6,events:[event]});phaseSix.update(1);assert.equal(phaseSix.lastEvent.expires,9);
  const other=new MissionEventSystem(world,{number:5,events:[event]});other.update(1);assert.equal(other.lastEvent.expires,7);
});

test('Phase 6 event banners use distinct titles and matching colors',()=>{
  const draw=(event)=>{const labels=[];const ctx={font:'',fillText:text=>labels.push(text),measureText:text=>({width:text.length*6}),save(){},restore(){},beginPath(){},roundRect(){},fill(){},stroke(){},set globalAlpha(_){},set fillStyle(_){},set strokeStyle(_){},set lineWidth(_){},set textAlign(_){},set textBaseline(_){}};
    const renderer=Object.create(Renderer.prototype);renderer.level={number:6};renderer.drawEventBanner(ctx,{mission:{events:{lastEvent:{event:{...event,message:'Evento de teste'},targets:[]}}},elapsed:2},800);return labels;};
  assert.deepEqual(draw({type:'machineLoad'}),['PICO DE CARGA','Evento de teste']);
  assert.deepEqual(draw({type:'activateMachine'}),['NOVO PROCESSO EM OPERAÇÃO','Evento de teste']);
  assert.deepEqual(draw({type:'outdoorTemperature'}),['ONDA DE CALOR','Evento de teste']);
});

test('heatwave tint only overlays outdoor cells while the outside is hot',()=>{
  const world=new World(5,5),fills=[],ctx={save(){},restore(){},fillRect(x,y){fills.push([x,y]);},set fillStyle(_){}};world.environment.temperature=35;
  for(const [x,y] of [[1,2],[3,2],[2,1],[2,3]])world.setMaterial(x,y,'concrete');
  const renderer={level:{number:6},tile:10};Renderer.prototype.drawHeatwaveTint.call(renderer,ctx,world,{x:0,y:0,width:50,height:50});
  assert.equal(fills.length,20);assert.equal(fills.some(([x,y])=>x===20&&y===20),false,'the enclosed interior tile is not tinted as exterior');
  fills.length=0;world.environment.temperature=OUTDOOR_TEMP;Renderer.prototype.drawHeatwaveTint.call(renderer,ctx,world,{x:0,y:0,width:20,height:20});assert.equal(fills.length,0);
  fills.length=0;renderer.level={number:5};world.environment.temperature=35;Renderer.prototype.drawHeatwaveTint.call(renderer,ctx,world,{x:0,y:0,width:20,height:20});assert.equal(fills.length,0);
});
