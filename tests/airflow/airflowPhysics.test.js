import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Fan } from '../../src/entities/Fan.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { AirTestScenarios } from '../../src/simulation/air/AirTestScenarios.js';

const metrics=()=>({generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0});

const run=(world,steps=260,dt=.05)=>{
  const system=new AirflowSystem(world,metrics());
  for(let i=0;i<steps;i++)system.updateVelocity(dt);
  return system;
};

const speedAt=(world,x,y)=>{
  const i=world.index(x,y);
  return Math.hypot(world.airX[i],world.airY[i]);
};

const avgSectionSpeed=(world,x,y1,y2)=>{
  let sum=0,count=0;
  for(let y=y1;y<=y2;y++){
    if(!world.isAir(x,y))continue;
    sum+=speedAt(world,x,y);count++;
  }
  return count?sum/count:0;
};

test('wall blocks normal airflow penetration',()=>{
  const world=new World(18,9);
  for(let y=0;y<9;y++)world.setMaterial(9,y,'concrete');
  world.addEntity(new Fan(4,4,{x:1,y:0}));
  run(world,220);
  assert.ok(speedAt(world,10,4)<.08);
});

test('pressure projection keeps post-solve divergence bounded',()=>{
  const {world}=AirTestScenarios.openFan();
  run(world,260);
  assert.ok(world.airDiagnostics.maxDivergence<1.5,'divergence '+world.airDiagnostics.maxDivergence);
});

test('open jet loses centerline velocity with distance',()=>{
  const {world}=AirTestScenarios.openFan();
  run(world,300);
  const near=speedAt(world,7,7);
  const far=speedAt(world,20,7);
  assert.ok(near>far,'near='+near+', far='+far);
  assert.ok(near>.05);
});

test('straight corridor retains more centerline velocity than open room',()=>{
  const open=AirTestScenarios.openFan();
  const duct=AirTestScenarios.straightDuct({length:24,width:5});
  run(open.world,320);run(duct.world,320);
  const openV=speedAt(open.world,17,7);
  const ductY=Math.floor((duct.top+duct.bottom)/2);
  const ductV=speedAt(duct.world,17,ductY);
  assert.ok(ductV>openV,'duct='+ductV+', open='+openV);
});

test('narrow corridor can increase local speed while reducing total fan flow',()=>{
  const wide=AirTestScenarios.straightDuct({length:22,width:7});
  const narrow=AirTestScenarios.narrowDuct();
  run(wide.world,320);run(narrow.world,320);
  const yw=Math.floor((wide.top+wide.bottom)/2),yn=Math.floor((narrow.top+narrow.bottom)/2);
  const wideV=speedAt(wide.world,14,yw),narrowV=speedAt(narrow.world,14,yn);
  assert.ok(narrowV>=wideV*.75,'narrowV='+narrowV+', wideV='+wideV);
  assert.ok(narrow.fan.currentFlow<wide.fan.currentFlow,'narrowQ='+narrow.fan.currentFlow+', wideQ='+wide.fan.currentFlow);
});

test('long corridor has lower fan flow than a short corridor',()=>{
  const short=AirTestScenarios.straightDuct({length:10,width:5});
  const long=AirTestScenarios.straightDuct({length:26,width:5});
  run(short.world,340);run(long.world,340);
  assert.ok(long.fan.currentFlow<short.fan.currentFlow,'long='+long.fan.currentFlow+', short='+short.fan.currentFlow);
});

test('dead-end corridor stalls relative to an open-ended corridor',()=>{
  const open=AirTestScenarios.straightDuct({length:20,width:3});
  const closed=AirTestScenarios.deadEnd();
  run(open.world,360);run(closed.world,360);
  assert.ok(closed.fan.currentFlow<open.fan.currentFlow*.75,'closed='+closed.fan.currentFlow+', open='+open.fan.currentFlow);
  assert.ok(closed.fan.currentPressureRise>=open.fan.currentPressureRise);
});

test('bend produces more loss than comparable straight path',()=>{
  const straight=AirTestScenarios.straightDuct({length:20,width:5});
  const bend=AirTestScenarios.bend90();
  run(straight.world,360);run(bend.world,360);
  assert.ok(bend.fan.currentFlow<straight.fan.currentFlow,'bend='+bend.fan.currentFlow+', straight='+straight.fan.currentFlow);
});

test('thermal advection transports heat downstream and conserves tile energy',()=>{
  const {world}=AirTestScenarios.openFan();
  world.setTemperature(6,7,80);
  const system=new AirflowSystem(world,metrics());
  const before=world.totalTileEnergy(),downstreamBefore=world.temperatureAt(10,7);
  for(let i=0;i<180;i++)system.update(.05);
  assert.ok(world.temperatureAt(10,7)>downstreamBefore);
  const after=world.totalTileEnergy()+system.metrics.externalEnergy;
  const rel=Math.abs(after-before)/Math.max(1,Math.abs(before));
  assert.ok(rel<1e-10,'energy drift '+rel);
});

test('open outlet maintains mass-flow path through a straight duct',()=>{
  const s=AirTestScenarios.straightDuct({length:20,width:5});
  run(s.world,320);
  const y1=s.top+1,y2=s.bottom-1;
  const near=avgSectionSpeed(s.world,7,y1,y2);
  const outlet=avgSectionSpeed(s.world,s.outletX-2,y1,y2);
  assert.ok(near>.03);
  assert.ok(outlet>.01);
});

test('two fans in series increase available pressure support',()=>{
  const one=AirTestScenarios.straightDuct({length:22,width:5});
  const two=AirTestScenarios.twoFansSeries();
  run(one.world,320);run(two.world,320);
  const onePressure=Math.max(one.fan.currentPressureRise,0);
  const twoPressure=Math.max(two.fan.currentPressureRise,0)+Math.max(two.secondFan.currentPressureRise,0);
  assert.ok(twoPressure>onePressure);
});
