import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
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

test('an adjacent air outlet is drawn as a physical duct connection before network identifiers refresh',()=>{
  const world=new World(5,4),duct=world.addUtility(new AirDuct(1,1));world.addEntity(new SupplyVent(2,1));
  duct.networkId=null;
  const segments=[];let start=null;
  const ctx={save(){},restore(){},beginPath(){},moveTo(x,y){start={x,y};},lineTo(x,y){segments.push({from:start,to:{x,y}});},stroke(){},arc(){},fill(){},setLineDash(){}};
  new CoolingDuctRenderer().draw(ctx,world,16);
  assert.ok(segments.some(segment=>segment.to.x>segment.from.x),'the duct end visibly reaches its adjacent outlet before simulation refreshes the network');
});

test('outlet socket faces the adjacent duct and animates only when the duct network is flowing',()=>{
  const world=new World(6,5),duct=world.addUtility(new AirDuct(2,2)),vent=world.addEntity(new SupplyVent(3,2));
  duct.networkId=vent.networkId='cooling-2-2';vent.networkStatus='READY';vent.flowRate=.8;
  const render=()=>{const arcs=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(x,y){arcs.push([x,y]);}};new CoolingDuctRenderer().drawOutletConnections(ctx,world,20,1);return arcs;};
  const flowing=render();
  assert.ok(flowing.some(([x,y])=>Math.abs(x-63.2)<1e-8&&y===50),'the socket is drawn on the side facing the duct');
  vent.flowRate=0;
  const idle=render();
  assert.equal(flowing.length,idle.length+1,'the moving air marker disappears when flow stops');
  vent.networkId=null;vent.networkStatus='DISCONNECTED';
  const disconnected=render();
  assert.equal(disconnected.length,idle.length,'disconnected outlets do not show a moving connection marker');
});
