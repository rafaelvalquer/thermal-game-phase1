import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HeatmapRenderer } from '../../src/rendering/HeatmapRenderer.js';
import { thermalCss } from '../../src/rendering/thermal/ThermalPalette.js';
import { World } from '../../src/world/World.js';

test('heatmap uses fixed gameplay color without a scale argument',()=>{
  const fills=[];
  const ctx={save(){},restore(){},fillRect(){},strokeRect(){},set globalCompositeOperation(_v){},set fillStyle(v){fills.push(v);},set strokeStyle(_v){},set lineWidth(_v){}};
  const world={width:1,height:1,index:()=>0,temperatureAtIndex:()=>40};
  new HeatmapRenderer().draw(ctx,world,12);
  assert.equal(fills[0],thermalCss(40,.88));
  assert.equal(HeatmapRenderer.prototype.draw.length,3);
});

test('phase 1 temperatures change to stable gameplay colors at each decision point',()=>{
  const fills=[],ctx={save(){},restore(){},fillRect(){},strokeRect(){},set globalCompositeOperation(_v){},set fillStyle(v){fills.push(v);},set strokeStyle(_v){},set lineWidth(_v){}};
  const world=new World(1,1),renderer=new HeatmapRenderer(),expected=[25,30,35,40,45].map(t=>thermalCss(t,.88));
  for(const temperature of [25,30,35,40,45]){world.setTemperature(0,0,temperature);renderer.draw(ctx,world,12);}
  assert.deepEqual(fills,expected);
  assert.equal(new Set(fills).size,5);
});

test('thermal heatmap is above ducts while rack temperature labels are the final scene layer',async()=>{
  const source=await readFile(new URL('../../src/rendering/Renderer.js',import.meta.url),'utf8');
  const ducts=source.indexOf("this.coolingDucts.draw(scene,world,this.tile,this.mode,this.camera.zoom,bounds)");
  const heatmap=source.indexOf("this.heatmap.draw(scene,world,this.tile,bounds,this.camera.zoom,uiTime)");
  const entities=source.indexOf("this.entities.draw(scene,world,this.tile,this.mode,time");
  const effects=source.indexOf("this.effects.draw(scene,world,this.tile,this.mode,time,bounds)");
  const hover=source.indexOf("this.drawHover(ctx,world,uiTime)");
  const indicators=source.indexOf("this.entities.drawThermalIndicators(ctx,this.tile");
  const selectionCard=source.indexOf("this.drawSelectionCard(ctx,simulation,width,height)");
  assert.ok(ducts>=0&&heatmap>ducts&&entities>heatmap,
    'draw ducts first, then the thermal field, then equipment sprites');
  assert.ok(indicators>effects&&indicators>entities&&indicators>hover&&indicators<selectionCard,
    'draw rack temperature labels above all world overlays and below the UI cards');
  assert.match(source,/ctx\.scale\(this\.camera\.zoom,this\.camera\.zoom\);ctx\.translate\(-this\.camera\.x,-this\.camera\.y\);\s*this\.entities\.drawThermalIndicators\(ctx/,
    'temperature labels use the same camera transform as the map');
});

test('gameplay renderer and UI no longer expose thermal autoscale',async()=>{
  const renderer=await readFile(new URL('../../src/rendering/Renderer.js',import.meta.url),'utf8');
  const main=await readFile(new URL('../../src/main.js',import.meta.url),'utf8');
  const ui=await readFile(new URL('../../src/ui/UIManager.js',import.meta.url),'utf8');
  assert.doesNotMatch(renderer,/thermalScale\s*\(/);
  assert.doesNotMatch(renderer,/thermalScaleMode/);
  assert.doesNotMatch(main,/data-thermal-scale|Escala automática|Escala fixa/);
  assert.doesNotMatch(ui,/data-thermal-scale|thermalScaleMode/);
  assert.match(renderer,/const renderDirect=this\.mode==='thermal'/);
  assert.match(renderer,/this\.mode!=='pressure'/);
});
