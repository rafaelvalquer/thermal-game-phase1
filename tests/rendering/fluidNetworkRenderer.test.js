import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../../src/rendering/Renderer.js';
import { World } from '../../src/world/World.js';
import { Pipe } from '../../src/entities/Pipe.js';

function recordingContext(){
  const events={fills:[],strokes:[],translations:[],alphas:[],rotations:[],moves:[]};
  const ctx=new Proxy({globalAlpha:1,fillStyle:'#000',strokeStyle:'#000',
    save(){},restore(){},beginPath(){},moveTo(x,y){events.moves.push([x,y]);},lineTo(){},closePath(){},rotate(angle){events.rotations.push(angle);},
    translate(x,y){events.translations.push([x,y]);},arc(){},stroke(){events.strokes.push({style:this.strokeStyle,alpha:this.globalAlpha});},
    fill(){events.fills.push({style:this.fillStyle,alpha:this.globalAlpha});},fillText(){},
  },{get(target,key){return key in target?target[key]:()=>{};},set(target,key,value){target[key]=value;if(key==='globalAlpha')events.alphas.push(value);return true;}});
  return {ctx,events};
}

function closedPair(world,x,y,networkId,temperature){
  const a=world.addEntity(new Pipe(x,y)),b=world.addEntity(new Pipe(x+1,y));
  for(const entity of [a,b]){entity.networkId=networkId;entity.networkStatus='CLOSED';entity.circuitClosed=true;entity.flowRate=1;entity.energy=entity.waterMass*4186*temperature;}
  a.downstreamId=b.id;b.upstreamId=a.id;
  return {a,b};
}

test('fluid view animates temperature-colored markers in the real pump direction',()=>{
  const world=new World(8,5),cold=closedPair(world,1,1,'loop-a',15),hot=closedPair(world,1,3,'loop-b',70),renderer=Object.create(Renderer.prototype);
  renderer.tile=20;renderer.camera={zoom:1};
  const first=recordingContext(),later=recordingContext();
  renderer.drawFluidNetwork(first.ctx,world,.1,null,1);renderer.drawFluidNetwork(later.ctx,world,.55,null,1);
  assert.ok(first.events.translations.length>0,'flow arrows are drawn');
  assert.notDeepEqual(first.events.translations,later.events.translations,'markers advance over time');
  assert.ok(first.events.rotations.includes(0),'markers point along the pump direction');
  assert.ok(first.events.moves.some(([x])=>x>=4.5),'flow markers are large enough to see');
  assert.ok(first.events.strokes.some(event=>event.style==='rgba(224,242,254,.95)'),'markers have a bright outline');
  const markerColors=first.events.fills.map(item=>item.style).filter(style=>String(style).startsWith('rgba('));
  assert.ok(markerColors.some(color=>color.includes('37,99,235')),'cold water uses a blue marker');
  assert.ok(markerColors.some(color=>color.includes('249,115,22')),'hot water uses an orange marker');
  assert.ok(cold.a.downstreamId===cold.b.id&&hot.a.downstreamId===hot.b.id);
});

test('fluid view animates every directed branch and does not mark a closed T junction as faulty',()=>{
  const world=new World(6,6),center=world.addEntity(new Pipe(2,2)),east=world.addEntity(new Pipe(3,2)),north=world.addEntity(new Pipe(2,1)),west=world.addEntity(new Pipe(1,2));
  for(const [x,y] of [[3,1],[3,3],[3,4],[2,4],[1,4],[1,3],[1,1]])world.addEntity(new Pipe(x,y));
  const links=[{from:center,to:east,flowRate:.6},{from:center,to:north,flowRate:.4},{from:west,to:center,flowRate:1}];
  for(const entity of [center,east,north,west]){entity.networkId='closed-tee';entity.networkStatus='CLOSED';entity.circuitClosed=true;entity.flowRate=1;entity.flowLinks=links.filter(link=>link.from===entity||link.to===entity);}
  const renderer=Object.create(Renderer.prototype);renderer.tile=20;renderer.camera={zoom:1};
  const result=recordingContext();renderer.drawFluidNetwork(result.ctx,world,.2,null,1);
  assert.ok(result.events.translations.length>=6,'particles animate along all three flowing connections');
  assert.ok(result.events.rotations.includes(0),'eastbound branch is shown');
  assert.ok(result.events.rotations.includes(-Math.PI/2),'northbound branch is shown');
  assert.equal(result.events.fills.some(event=>event.style==='#7f1d1d'),false,'a valid closed tee has no fault badge');
});

test('selecting a hydraulic device attenuates other loops and open circuits show fault styling',()=>{
  const world=new World(8,5),first=closedPair(world,1,1,'loop-a',20),second=closedPair(world,1,3,'loop-b',25),renderer=Object.create(Renderer.prototype);
  renderer.tile=20;renderer.camera={zoom:1};renderer.selectedEntity=first.a;
  let result=recordingContext();renderer.drawFluidNetwork(result.ctx,world,.2,first.a,1);
  assert.ok(result.events.alphas.includes(.14),'unrelated loop is visually dimmed');
  first.a.circuitClosed=false;first.a.networkStatus='OPEN CIRCUIT';first.b.circuitClosed=false;first.b.networkStatus='OPEN CIRCUIT';
  result=recordingContext();renderer.drawFluidNetwork(result.ctx,world,.2,first.a,1);
  assert.ok(result.events.strokes.some(event=>event.style==='rgba(251,113,133,.88)'), 'invalid connections are red');
  assert.ok(result.events.fills.some(event=>event.style==='#7f1d1d'), 'open ends receive an alert marker');
  assert.ok(second.a.networkId==='loop-b');
});
