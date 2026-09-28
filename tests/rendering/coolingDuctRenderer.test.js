import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { CoolingDuctRenderer } from '../../src/rendering/cooling/CoolingDuctRenderer.js';

test('adjacent ducts draw a continuous joint before network identifiers refresh',()=>{
  const world=new World(5,4),first=world.addUtility(new AirDuct(1,1)),second=world.addUtility(new AirDuct(2,1));
  first.networkId='stale-a';second.networkId='stale-b';
  const segments=[];let start=null;
  const ctx={save(){},restore(){},beginPath(){},moveTo(x,y){start={x,y};},lineTo(x,y){segments.push({from:start,to:{x,y}});},stroke(){},arc(){},fill(){},setLineDash(){}};
  new CoolingDuctRenderer().draw(ctx,world,16);
  assert.ok(segments.some(segment=>segment.to.x>segment.from.x),'the visually touching segments show their physical connection');
  assert.ok(segments.some(segment=>segment.to.x<segment.from.x),'the neighboring duct also draws its reciprocal joint');
});
