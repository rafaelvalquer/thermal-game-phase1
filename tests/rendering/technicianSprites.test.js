import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {technicianAction,technicianState} from '../../src/rendering/sprites/TechnicianVisualState.js';
import {SpriteAnimator} from '../../src/rendering/sprites/SpriteAnimator.js';
import {SpriteAtlas} from '../../src/rendering/sprites/SpriteAtlas.js';
import {EquipmentSpriteRenderer} from '../../src/rendering/sprites/EquipmentSpriteRenderer.js';
import {SPRITES} from '../../src/rendering/sprites/SpriteManifest.js';
import {createTechnicianScene} from '../../src/dev/visualScene.js';
import {TechnicianSystem} from '../../src/simulation/TechnicianSystem.js';

test('all technician directions and actions map to their own atlas rows',()=>{
  const atlas=new SpriteAtlas(),directions=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];
  for(const [a,action] of ['moving','working','cooldown'].entries())for(const [d,facing] of directions.entries()){
    const e={action,facing,x:2,y:2,path:[{x:3,y:2}],pathIndex:0};
    const state=technicianState(e);assert.equal(SPRITES.technician.stateRows[state],a*4+d);
    for(let frame=0;frame<4;frame++)assert.deepEqual(atlas.sourceRect('technician',frame,state),{x:frame*64,y:(a*4+d)*64,width:64,height:64});
  }
});
test('stationary patrol is idle, active segment walks, and motion preferences freeze frames',()=>{
  const animator=new SpriteAnimator(),e={type:'technician',id:'test',action:'patrolling',x:2,y:2,path:[],moveProgress:0};
  assert.equal(technicianAction(e),'idle');assert.equal(animator.fpsFor(e,SPRITES.technician),0);
  Object.assign(e,{fromX:2,fromY:2,toX:3,toY:2,moveProgress:.4});
  assert.equal(technicianAction(e),'walking');assert.equal(animator.fpsFor(e,SPRITES.technician),5);
  assert.equal(animator.frameFor(e,SPRITES.technician,2),animator.frameFor(e,SPRITES.technician,2));
  assert.equal(new SpriteAnimator({reduceMotion:()=>true}).frameFor(e,SPRITES.technician,2),0);
  e.action='working';assert.equal(technicianAction(e),'working');assert.equal(animator.fpsFor(e,SPRITES.technician),3);
});
test('technician sheet has static idle views and distinct walking and maintenance frames',async()=>{
  const svg=await readFile('public/assets/sprites/machines/technician.svg','utf8');
  const groups=[...svg.matchAll(/<g[^>]*>(.*?)<\/g>/g)].map(m=>m[1]);assert.equal(groups.length,48);
  assert.ok(!svg.includes('rotate('));
  for(let row=0;row<12;row++){const unique=new Set(groups.slice(row*4,row*4+4));assert.equal(row>=8?unique.size===1:unique.size>=3,true,`row ${row}`);}
  assert.equal(new Set([0,4,8,12].map(i=>groups[i])).size,4);
});
test('technician inspection scene exercises all twelve poses and missing sprites fall back',()=>{
  const scene=createTechnicianScene();scene.update(.5);assert.equal(scene.world.entitiesByType('technician').length,12);
  assert.equal(new Set(scene.world.entitiesByType('technician').map(technicianState)).size,12);
  const renderer=new EquipmentSpriteRenderer({manager:{get:()=>null}});
  assert.equal(renderer.draw({},scene.world,scene.world.entitiesByType('technician')[0],32,'normal',0),false);
});

test('maintenance faces racks on each side without changing character orientation rules',()=>{
  const worker={x:5,y:5,action:'working'},system=new TechnicianSystem({},{});
  for(const [x,y,direction] of [[5,4,'north'],[6,5,'east'],[5,6,'south'],[4,5,'west']]){
    system.faceRack(worker,{x,y});assert.equal(technicianState(worker),`technician-working-${direction}`);
  }
});
