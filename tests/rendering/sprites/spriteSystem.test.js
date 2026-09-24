import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SPRITES, validateSpriteManifest } from '../../../src/rendering/sprites/SpriteManifest.js';
import { SpriteAtlas } from '../../../src/rendering/sprites/SpriteAtlas.js';
import { SpriteAnimator } from '../../../src/rendering/sprites/SpriteAnimator.js';
import { getVisualState, resolveVisualRotation, rotatePort } from '../../../src/rendering/sprites/SpriteDefinition.js';
import { SpriteManager } from '../../../src/rendering/sprites/SpriteManager.js';
import { EquipmentSpriteRenderer } from '../../../src/rendering/sprites/EquipmentSpriteRenderer.js';

test('sprite manifest defines valid sheets and one-tile physical footprints',()=>{
  assert.deepEqual(validateSpriteManifest(),[]);
  for(const sprite of Object.values(SPRITES)){
    assert.equal(sprite.frameWidth,64);
    assert.equal(sprite.footprint.width,1);
    assert.equal(sprite.footprint.height,1);
  }
});

test('generated sheets use transparent 64px frames matching every manifest entry',async()=>{
  for(const sprite of Object.values(SPRITES)){
    const path=resolve('public',sprite.path.replace(/^\//,'')),svg=await readFile(path,'utf8');
    assert.match(svg,new RegExp(`width="${sprite.frameWidth*sprite.frames}"`),sprite.id);
    assert.match(svg,new RegExp(`height="${sprite.frameHeight}"`),sprite.id);
    assert.match(svg,/viewBox="0 0 /,sprite.id);
    assert.doesNotMatch(svg,/rect[^>]*width="(?:192|128|64)"[^>]*height="64"[^>]*fill="(?:#|url\()/i,sprite.id);
  }
});

test('atlas wraps requested frames inside the available horizontal sheet',()=>{
  const atlas=new SpriteAtlas();
  assert.deepEqual(atlas.sourceRect('pump',-1),{x:128,y:0,width:64,height:64});
  assert.deepEqual(atlas.sourceRect('tank',4),{x:64,y:0,width:64,height:64});
  assert.equal(atlas.sourceRect('missing',0),null);
  const grid=new SpriteAtlas({test:{id:'test',frames:5,frameWidth:16,frameHeight:12,framesPerRow:3,atlasRect:{x:8,y:4}}});
  assert.deepEqual(grid.sourceRect('test',4),{x:24,y:16,width:16,height:12});
});

test('animation speed follows equipment operation and freezes when disabled',()=>{
  const animator=new SpriteAnimator();
  const pump=SPRITES.pump;
  assert.equal(animator.fpsFor({type:'pump',enabled:true,flowRate:.5},pump),4);
  assert.equal(animator.fpsFor({type:'pump',enabled:false,flowRate:2},pump),0);
  assert.equal(animator.fpsFor({type:'tank',enabled:false},SPRITES.tank),0);
  assert.equal(animator.fpsFor({type:'fan',enabled:true,currentVelocity:.5},SPRITES.fan),1);
  assert.equal(animator.fpsFor({type:'fan',enabled:true,currentVelocity:20},SPRITES.fan),14);
  assert.equal(animator.fpsFor({type:'coolingUnit',enabled:true,currentAirFlow:2.5,loadRatio:1},SPRITES.coolingUnit),6);
  assert.equal(animator.fpsFor({type:'coolingUnit',enabled:true,currentAirFlow:0,loadRatio:0},SPRITES.coolingUnit),0);
  assert.equal(animator.frameFor({id:'x',type:'pump',enabled:false,flowRate:0},pump,99),0);
});

test('animated frames stay in range and are phase-shifted deterministically by entity id',()=>{
  const animator=new SpriteAnimator();
  for(let time=0;time<120;time+=.17){
    const frame=animator.frameFor({id:'pump-17',type:'pump',enabled:true,flowRate:.8},SPRITES.pump,time);
    assert.ok(frame>=0&&frame<SPRITES.pump.frames);
  }
  const entity={id:'pump-17',type:'pump',enabled:true,flowRate:.8};
  assert.equal(animator.frameFor(entity,SPRITES.pump,12),animator.frameFor(entity,SPRITES.pump,12));
  assert.equal(new SpriteAnimator({reduceMotion:()=>true}).frameFor(entity,SPRITES.pump,12),0);
});

test('visual state and ports reflect alarms and quarter-turn rotations',()=>{
  assert.equal(getVisualState({enabled:false,temperature:100,failureTemperature:80}),'off');
  assert.equal(getVisualState({enabled:true,temperature:81,failureTemperature:80}),'critical');
  assert.equal(getVisualState({enabled:true,temperature:70,failureTemperature:80}),'warning');
  assert.equal(getVisualState({enabled:true,status:'WARNING',temperature:30}),'warning');
  assert.equal(resolveVisualRotation({x:0,y:-1}),-Math.PI/2);
  const port=rotatePort({x:1,y:.5,direction:'right'},Math.PI/2);
  assert.ok(Math.abs(port.x-.5)<1e-9);
  assert.equal(port.y,1);
  assert.equal(port.direction,'down');
});

test('missing images are recorded and leave procedural fallback available',async()=>{
  class MissingImage {
    set src(_value){queueMicrotask(()=>this.onerror?.());}
  }
  const manager=new SpriteManager({definitions:{pump:SPRITES.pump},ImageClass:MissingImage});
  const result=await manager.loadAll();
  assert.deepEqual(result,{loaded:0,failed:1});
  assert.equal(manager.get('pump'),null);
  assert.equal(manager.draw({},'pump',0,0,0,64,64),false);
  assert.equal(manager.stats.failed,1);
});

test('sprite manager rejects a sheet that cannot contain all declared frames',async()=>{
  class ShortImage {
    naturalWidth=128;naturalHeight=64;
    set src(_value){queueMicrotask(()=>this.onload?.());}
  }
  const manager=new SpriteManager({definitions:{pump:SPRITES.pump},ImageClass:ShortImage});
  assert.deepEqual(await manager.loadAll(),{loaded:0,failed:1});
  assert.equal(manager.get('pump'),null);
});

test('equipment renderer layers connection linework, crisp sprite, ports, and state effects',()=>{
  const order=[];
  const renderer=new EquipmentSpriteRenderer({
    manager:{get:()=>({}),draw(_ctx,_id,frame){order.push(`sprite:${frame}`);return true;}},
    animator:{frameFor:()=>2},
    effects:{drawShadow:()=>order.push('shadow'),drawThermalGlow:()=>order.push('glow'),drawState:(_ctx,_e,_x,_y,_w,_h,_time,options)=>order.push(options.selected?'selected-state':'state')},
    ports:{draw:(_ctx,_world,_entity,_definition,_tile,_mode,options)=>order.push(options.selected?'selected-ports':'ports')},
  });
  renderer.fallback={equipmentPorts:()=>order.push('fluid-links')};
  const ctx={save(){},restore(){},translate(){},rotate(){}};
  assert.equal(renderer.draw(ctx,{}, {id:1,type:'pump',x:2,y:3,direction:{x:1,y:0},enabled:true,waterTemperature:25},14,'normal',1,{selected:true}),true);
  assert.deepEqual(order,['shadow','glow','fluid-links','sprite:2','selected-ports','state']);
});
