import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityRenderer } from '../../src/rendering/EntityRenderer.js';
import { World } from '../../src/world/World.js';

function context(){return {drawImage(){},clearRect(){},save(){},restore(){},setTransform(){},imageSmoothingEnabled:true};}
class TestCanvas{
  constructor(width,height){this.width=width;this.height=height;this.context=context();}
  getContext(type){return type==='2d'?this.context:null;}
}

test('static entity layer reuses its raster between refreshes and invalidates on topology changes',()=>{
  let now=0,entityDraws=0,layerBlits=0;
  const world=new World(10,8);world.addEntity({id:'rack',type:'fixture',x:2,y:3,temperature:30});
  const renderer=new EntityRenderer({CanvasClass:TestCanvas,clock:()=>now,staticLayerRefreshMs:50});
  renderer.sprites={fallback:null,visualFootY:()=>.8,isAnimated:()=>true,draw:()=>{entityDraws++;return true;}};
  const scene=context();scene.drawImage=()=>{layerBlits++;};

  renderer.draw(scene,world,16,'normal',0);
  assert.equal(entityDraws,1);assert.equal(layerBlits,1);assert.equal(renderer.staticLayerDrawCount,1);
  now=49;renderer.draw(scene,world,16,'normal',.049);
  assert.equal(entityDraws,1,'a cached sprite layer should skip per-entity canvas draws');assert.equal(layerBlits,2);assert.equal(renderer.stats.visibleEntities,1);assert.equal(renderer.stats.animated,1);
  now=50;renderer.draw(scene,world,16,'normal',.05);
  assert.equal(entityDraws,2);assert.equal(renderer.staticLayerDrawCount,2);

  world.addEntity({id:'vent',type:'fixture',x:4,y:3});renderer.draw(scene,world,16,'normal',.051);
  assert.equal(entityDraws,4,'adding an entity should rebuild the cached layer immediately');assert.equal(renderer.staticLayerDrawCount,3);assert.equal(renderer.stats.visibleEntities,2);
});

test('static entity layer falls back when the map would exceed the raster cache limit',()=>{
  const world=new World(200,200);world.addEntity({id:'fixture',type:'fixture',x:1,y:1});
  const renderer=new EntityRenderer({CanvasClass:TestCanvas,maxStaticLayerPixels:16,clock:()=>0});let draws=0;
  renderer.sprites={fallback:null,visualFootY:()=>0,isAnimated:()=>false,draw:()=>{draws++;return true;}};
  const scene=context();
  renderer.draw(scene,world,16,'normal',0);
  assert.equal(draws,1);assert.equal(renderer.staticLayerDrawCount,0,'oversized maps should retain the direct draw path');
});

test('static entity layer keeps viewport culling efficient when most entities are offscreen',()=>{
  const world=new World(20,20);world.addEntity({id:'near',type:'fixture',x:1,y:1});world.addEntity({id:'far',type:'fixture',x:18,y:18});
  const renderer=new EntityRenderer({CanvasClass:TestCanvas,clock:()=>0});let draws=0;
  renderer.sprites={fallback:null,visualFootY:()=>0,isAnimated:()=>false,draw:()=>{draws++;return true;}};
  renderer.draw(context(),world,16,'normal',0,{bounds:{x:0,y:0,width:80,height:80}});
  assert.equal(draws,1);assert.equal(renderer.staticLayerDrawCount,0,'only the visible sprite should be submitted');assert.equal(renderer.stats.visibleEntities,1);
});
