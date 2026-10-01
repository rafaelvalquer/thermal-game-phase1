import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/game/Game.js';

test('thermal focus selects the machine and eases the camera without snapping',()=>{
  const camera={x:0,y:0,zoom:1},entity={id:8,x:20,y:12},inspections=[];
  const game=Object.create(Game.prototype);game.ui={inspectEntity:item=>inspections.push(item)};game.viewMode='2d';game.camera=camera;game.renderer={tile:14};game.canvas={getBoundingClientRect:()=>({width:800,height:600})};
  assert.equal(game.focusThermalEntity(entity),true);assert.deepEqual(inspections,[entity]);assert.equal(camera.x,0);assert.equal(camera.zoom,1);
  game.updateCameraFocus(.2);assert.ok(camera.zoom>1&&camera.zoom<1.65);assert.notEqual(camera.x,0);
  for(let i=0;i<5;i++)game.updateCameraFocus(.2);assert.equal(game.cameraFocus,null);assert.equal(camera.zoom,1.65);
});
