import test from 'node:test';
import assert from 'node:assert/strict';
import { CoolingOverlayRenderer } from '../../src/rendering/cooling/CoolingOverlayRenderer.js';
import { Renderer } from '../../src/rendering/Renderer.js';
import { World } from '../../src/world/World.js';

function context(){
  const events={alphas:[],lines:[],texts:[],strokes:[]};
  const ctx=new Proxy({globalAlpha:1,strokeStyle:'',save(){},restore(){},beginPath(){},closePath(){},arc(){},fill(){},fillRect(){},strokeRect(){},setLineDash(){},
    moveTo(x,y){events.lines.push([x,y]);},lineTo(x,y){events.lines.push([x,y]);},fillText(text){events.texts.push(text);},stroke(){events.strokes.push({style:this.strokeStyle,alpha:this.globalAlpha});}},
  {get(target,key){return key in target?target[key]:()=>{};},set(target,key,value){target[key]=value;if(key==='globalAlpha')events.alphas.push(value);return true;}});
  return {ctx,events};
}

test('selected cooling network highlights its actual route and dims unrelated networks',()=>{
  const unit={type:'coolingUnit',x:1,y:1,networkId:'cooling-a',missionId:'AC-01'},duct={type:'duct',x:2,y:1,networkId:'cooling-a'},vent={type:'supplyVent',x:3,y:1,networkId:'cooling-a'},otherDuct={type:'duct',x:1,y:4,networkId:'cooling-b'},otherUnit={type:'coolingUnit',x:0,y:4,networkId:'cooling-b',missionId:'AC-02'},otherVent={type:'supplyVent',x:2,y:4,networkId:'cooling-b'};
  const network={id:'cooling-a',status:'READY',sourceUnits:[unit],ducts:[duct],vents:[vent],paths:[{unit,path:[duct],vent}]},other={id:'cooling-b',status:'READY',sourceUnits:[otherUnit],ducts:[otherDuct],vents:[otherVent],paths:[]},world={coolingSystem:{networks:[network,other]}};
  const result=context();new CoolingOverlayRenderer().draw(result.ctx,world,20,0,1,unit);
  assert.ok(result.events.alphas.some(alpha=>alpha===.16),'the unrelated network is attenuated');
  assert.ok(result.events.lines.some(([x])=>x===50)&&result.events.lines.some(([x])=>x===70),'selected source-to-outlet path follows its duct route');
  assert.ok(result.events.alphas.some(alpha=>alpha===.9),'the selected network stays emphasized');
});

test('selected grille coverage marks a wall blocking its discharge',()=>{
  const world=new World(6,4);world.setMaterial(3,2,'concrete');
  const events=[],ctx=new Proxy({globalAlpha:1,fillStyle:'',strokeStyle:'',save(){},restore(){},fillRect(x,y){events.push({kind:'fill',x,y,style:this.fillStyle});},strokeRect(x,y){events.push({kind:'stroke',x,y,style:this.strokeStyle});},beginPath(){},moveTo(){},lineTo(){},stroke(){}},
    {get(target,key){return key in target?target[key]:()=>{};},set(target,key,value){target[key]=value;return true;}});
  const renderer=Object.create(Renderer.prototype);renderer.tile=20;renderer.camera={zoom:1};renderer.drawVentCoverage(ctx,world,{x:2,y:2,direction:{x:1,y:0}});
  assert.ok(events.some(event=>event.kind==='fill'&&event.x===61&&event.y===41&&event.style==='rgba(127,29,29,.72)'));
});
