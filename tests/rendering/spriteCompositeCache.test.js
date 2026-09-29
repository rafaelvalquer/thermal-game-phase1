import test from 'node:test';
import assert from 'node:assert/strict';
import { EquipmentSpriteRenderer } from '../../src/rendering/sprites/EquipmentSpriteRenderer.js';
import { SPRITES } from '../../src/rendering/sprites/SpriteManifest.js';

class FakeCanvas {
  constructor(width,height){this.width=width;this.height=height;this.context={fillStyle:'',strokeStyle:'',lineWidth:1,save(){},restore(){},clearRect(){},fillRect(){},strokeRect(){},fillText(){}};}
  getContext(){return this.context;}
}

test('sprite composites reuse frame/state variants and rebuild only when a visual variant changes',()=>{
  let sourceDraws=0;
  const manager={draw(){sourceDraws++;return true;}};
  const renderer=new EquipmentSpriteRenderer({manager,CanvasClass:FakeCanvas});
  const definition=SPRITES.serverRack,entity={type:'serverRack',temperature:31,enabled:true,loadMultiplier:1};
  const base={id:'serverRack',frame:0,state:'running',entity,definition,mode:'normal',time:0,options:{}};
  const first=renderer.compositeFrame(base),same=renderer.compositeFrame({...base,time:1});
  assert.equal(first,same);
  assert.equal(sourceDraws,1,'unchanged equipment should reuse its baked sprite frame');

  const nextFrame=renderer.compositeFrame({...base,frame:1});
  const hotter=renderer.compositeFrame({...base,entity:{...entity,temperature:85}});
  assert.notEqual(nextFrame,first);
  assert.notEqual(hotter,first);
  assert.equal(sourceDraws,3,'new animation or glow variants are composed once each');
});

test('sprite composite cache stays within its configured memory bound',()=>{
  const renderer=new EquipmentSpriteRenderer({manager:{draw(){return true;}},CanvasClass:FakeCanvas,compositeLimit:2});
  const definition=SPRITES.serverRack,entity={type:'serverRack',temperature:20,enabled:true};
  for(let frame=0;frame<4;frame++)renderer.compositeFrame({id:'serverRack',frame,state:'running',entity,definition,mode:'normal',time:0,options:{}});
  assert.equal(renderer.compositeFrames.size,2);
});
