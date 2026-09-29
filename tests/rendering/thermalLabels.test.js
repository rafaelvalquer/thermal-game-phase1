import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityRenderer } from '../../src/rendering/EntityRenderer.js';

test('rack temperature label is positioned above the rack cell, clear of the duct row',()=>{
  const fills=[],labels=[];
  const ctx={
    save(){},restore(){},strokeRect(){},fillRect(...args){fills.push(args);},
    measureText:()=>({width:24}),fillText(...args){labels.push(args);},
    set font(_value){},set textAlign(_value){},set textBaseline(_value){},
    set fillStyle(_value){},set strokeStyle(_value){},set lineWidth(_value){},
    set globalAlpha(_value){}
  };
  const renderer=new EntityRenderer();
  const rack={type:'serverRack',x:4,y:10,temperature:32.5};
  renderer.thermalIndicator(ctx,rack,16);
  const labelBackground=fills.at(-1);
  assert.ok(labelBackground[1]+labelBackground[3] < rack.y*16,
    'temperature badge should sit entirely above the rack tile');
  assert.equal(labels[0][0],'32.5°');
});
