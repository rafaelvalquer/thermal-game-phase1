import test from 'node:test';
import assert from 'node:assert/strict';
import { PowerGridSystem } from '../../src/datacenter/PowerGridSystem.js';
import { DataCenterManager } from '../../src/datacenter/DataCenterManager.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { DataCenterDashboard } from '../../src/ui/DataCenterDashboard.js';
import { World } from '../../src/world/World.js';
import { Simulation } from '../../src/simulation/Simulation.js';
import { BuildSystem } from '../../src/building/BuildSystem.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { ComputeRack } from '../../src/entities/ComputeRack.js';
import { Fan } from '../../src/entities/Fan.js';
import { Pump } from '../../src/entities/Pump.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirDuct as Duct } from '../../src/entities/AirDuct.js';

function rack(world,kw,x=2,y=2){
  const e=world.addEntity(new ServerRack(x,y,{heatOutput:kw*980,startAt:0}));
  e.power=kw*1000;e.requestedPower=e.power;return e;
}
function fixture(storage=new Map()){
  const world=new World(12,12);
  const level={id:'power-test',datacenter:{powerCapacityKW:100,rackSpace:20},thermalSystems:{simpleCooling:true,waterCooling:true},objectives:[],failures:[],events:[],missionDuration:Infinity,objectiveStartAt:0,powerLimit:100000};
  world.thermalSystems=level.thermalSystems;
  const saveSystem=new DataCenterSaveSystem({storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
  const dc=new DataCenterManager(world,level,{saveSystem}),sim=new Simulation(world,level);
  const build=new BuildSystem(world,sim,{budget:150000,inventory:{}});
  dc.attach(build,sim);sim.initialize();return {world,dc,sim,build,level,storage};
}

test('electrical thresholds include exactly 90, 100 and 110 percent and five physical seconds',()=>{
  for(const [kw,status] of [[89.99,'NORMAL'],[90,'ALERTA'],[100,'ALERTA'],[100.01,'SOBRECARGA'],[110,'SOBRECARGA']]){
    const world=new World(5,5),grid=new PowerGridSystem();rack(world,kw);
    grid.update(world,1);assert.equal(grid.status,status);assert.equal(grid.blockedRacks,0);
  }
  const world=new World(5,5),grid=new PowerGridSystem(),e=rack(world,105);
  grid.update(world,4.9);assert.equal(e.powerBlocked,false);
  e.requestedPower=100000;grid.update(world,.1);assert.equal(grid.overloadSeconds,0);
  e.requestedPower=105000;grid.update(world,4.9);assert.equal(e.powerBlocked,false);
  grid.update(world,.1);assert.equal(e.powerBlocked,true);assert.equal(grid.effectiveKW,0);
  const immediate=new World(5,5),fast=new PowerGridSystem();rack(immediate,110.001);
  fast.update(immediate,.001);assert.equal(fast.blockedRacks,1);
});

test('130 kW cuts the largest rack before heat and billing, without automatically restoring it',()=>{
  const {world,dc,sim}=fixture();
  const largest=rack(world,60,2),other=rack(world,40,4);rack(world,30,6);
  sim.step(1/60);
  assert.equal(largest.powerBlocked,true);assert.equal(largest.enabled,true);
  assert.equal(other.powerBlocked,false);assert.equal(sim.metrics.powerDraw,70000);
  assert.equal(largest.heatGenerationPower,0);assert.equal(largest.currentPowerKW,0);
  assert.equal(largest.heatOutputKW,0);assert.equal(largest.temperature,25);
  assert.equal(sim.metrics.powerEnergy,70000*6);assert.equal(dc.powerGrid.demandKW,130);
  sim.step(1/60);assert.equal(largest.powerBlocked,true);
  assert.equal(dc.rearmPower().restored,0);
  assert.equal(dc.upgradePower(250).ok,true);assert.equal(largest.powerBlocked,true);
  assert.equal(dc.rearmPower().restored,1);assert.equal(largest.power,60000);
});

test('electrical protection selectively cuts compute racks while reservations remain intact',()=>{
  const world=new World(8,8),grid=new PowerGridSystem({capacityKW:100}),rack=world.addEntity(new ComputeRack(3,3,{specialization:'gpu',modelId:'basic'}));
  rack.requestedPower=110100;rack.power=110100;rack.heatOutput=110100;rack.currentPowerW=110100;
  grid.update(world,.01);
  assert.equal(rack.powerBlocked,true);assert.equal(rack.currentPowerW,0);assert.equal(rack.heatGenerationPower,0);
  assert.equal(grid.blockedRacks,1);assert.equal(rack.status,'POWER_OFF');
});

test('equal loads cut by map position and manual restoration prefers smaller loads',()=>{
  const world=new World(8,8),grid=new PowerGridSystem();
  const right=rack(world,40,5),left=rack(world,40,2);rack(world,40,3,4);
  grid.update(world,.01);assert.equal(left.powerBlocked,true);assert.equal(right.powerBlocked,false);
  right.powerBlocked=true;right.requestedPower=20000;
  const result=grid.rearm(world);assert.equal(result.restored,2);assert.equal(grid.effectiveKW,100);
  left.powerBlocked=true;right.powerBlocked=true;left.requestedPower=70000;
  assert.equal(grid.rearm(world).restored,1);assert.equal(right.powerBlocked,false);assert.equal(left.powerBlocked,true);
});

test('pause and speed affect protection without using the accelerated calendar',()=>{
  const {world,dc,sim}=fixture();const e=rack(world,105);
  sim.update(.1);assert.equal(dc.powerGrid.overloadSeconds,.1);
  sim.paused=true;sim.update(60);assert.equal(dc.powerGrid.overloadSeconds,.1);
  sim.paused=false;sim.setSpeed(8);for(let frame=0;frame<36;frame++)sim.update(1/60);
  assert.ok(Math.abs(dc.powerGrid.overloadSeconds-4.9)<1e-9);assert.equal(e.powerBlocked,false);
  sim.update(1/60);assert.equal(e.powerBlocked,true);
});

test('utility power contributes to demand and a general breaker blocks new equipment',()=>{
  const {world,dc,sim}=fixture();
  const pump=world.addEntity(new Pump(4,4));pump.power=120000;
  const utility=world.addUtility(new Duct(5,4));utility.power=800;
  const off=world.addEntity(new Fan(6,6));off.enabled=false;
  const e=rack(world,10);
  sim.step(1/60);assert.equal(dc.powerGrid.breakerOpen,true);assert.equal(sim.metrics.powerDraw,0);
  assert.equal(pump.powerBlocked,true);assert.equal(e.powerBlocked,true);
  const added=world.addEntity(new Fan(7,7));sim.step(1/60);
  assert.equal(added.powerBlocked,true);assert.equal(sim.metrics.powerDraw,0);
  assert.equal(dc.rearmPower().ok,false);
  pump.power=50000;
  const addedWhilePaused=rack(world,90,9,9);
  assert.equal(dc.rearmPower().ok,true);assert.equal(off.enabled,false);
  assert.equal(addedWhilePaused.powerBlocked,true);
  assert.equal(pump.powerBlocked,false);assert.equal(added.powerBlocked,false);
  sim.step(1/60);assert.equal(sim.metrics.powerDraw,61100);
});

test('cool but disconnected racks accrue downtime only for their own contract',()=>{
  const {world,dc,sim}=fixture();
  const makeContract=id=>({id,status:'active',maxInletTemperature:30,availability:99.9,activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0,dailyActiveSeconds:0,dailyUptimeSeconds:0,dailyDowntimeSeconds:0});
  dc.state.contracts=[makeContract('a'),makeContract('b')];
  const a=rack(world,80,2),b=rack(world,50,5);
  Object.assign(a,{contractId:'a',maxPowerKW:80,loadProfile:'banking'});
  Object.assign(b,{contractId:'b',maxPowerKW:50,loadProfile:'banking'});
  dc.clock.seconds=12*3600;sim.step(1/60);
  assert.equal(a.powerBlocked,true);assert.equal(b.powerBlocked,false);
  assert.equal(dc.state.contracts[0].downtimeSeconds,6);assert.equal(dc.state.contracts[1].uptimeSeconds,6);
  assert.equal(a.uptime,0);assert.equal(b.uptime,100);
  dc.racks.evaluateDailyAvailability();assert.equal(dc.state.contracts[0].dailyViolation,true);
  assert.equal(dc.state.contracts[1].dailyViolation,undefined);
});

test('brief thermal SLA spikes show HOT but count as uptime and reset on recovery',()=>{
  const {world,dc}=fixture(),contract={id:'thermal',status:'active',maxInletTemperature:30,availability:99.9,
    activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0,dailyActiveSeconds:0,dailyUptimeSeconds:0,dailyDowntimeSeconds:0};
  dc.state.contracts=[contract];
  const e=rack(world,10);e.contractId=contract.id;
  world.setTemperature(e.x,e.y-1,30.1);dc.racks.update(30,dc.clock);
  assert.equal(e.status,'HOT');dc.racks.afterThermalStep(30);
  assert.equal(e.thermalViolationSeconds,30);assert.equal(contract.dailyViolation,undefined);
  assert.equal(contract.dailyDowntimeSeconds,0);assert.equal(contract.dailyUptimeSeconds,30);
  world.setTemperature(e.x,e.y-1,30);dc.racks.update(1,dc.clock);dc.racks.afterThermalStep(1);
  assert.equal(e.status,'NORMAL');assert.equal(e.thermalViolationSeconds,0);
  assert.equal(contract.dailyViolation,undefined);assert.equal(contract.dailyDowntimeSeconds,0);
});

test('thermal SLA marks a violation only after more than 60 continuous seconds and counts only excess as downtime',()=>{
  const {world,dc}=fixture(),contract={id:'thermal',status:'active',maxInletTemperature:30,availability:99.9,
    activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0,dailyActiveSeconds:0,dailyUptimeSeconds:0,dailyDowntimeSeconds:0};
  dc.state.contracts=[contract];const e=rack(world,10);e.contractId=contract.id;e.inletTemperature=31;
  world.setTemperature(e.x,e.y-1,31);dc.racks.update(60,dc.clock);dc.racks.afterThermalStep(60);
  assert.equal(contract.dailyViolation,undefined);assert.equal(contract.dailyDowntimeSeconds,0);
  dc.racks.update(5,dc.clock);dc.racks.afterThermalStep(5);
  assert.equal(contract.dailyViolation,true);assert.equal(e.thermalViolationSeconds,65);
  assert.equal(contract.dailyUptimeSeconds,60);assert.equal(contract.dailyDowntimeSeconds,5);
  assert.equal(e.downtimeSeconds,5);
});

test('thermal SLA grace uses simulation seconds while availability keeps data-center clock seconds',()=>{
  const {world,dc}=fixture(),contract={id:'thermal',status:'active',maxInletTemperature:30,availability:99.9,
    activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0,dailyActiveSeconds:0,dailyUptimeSeconds:0,dailyDowntimeSeconds:0};
  dc.state.contracts=[contract];const e=rack(world,10);e.contractId=contract.id;e.inletTemperature=31;
  world.setTemperature(e.x,e.y-1,31);
  for(let i=0;i<60;i++)dc.racks.afterThermalStep(360,1);
  assert.equal(e.thermalViolationSeconds,60);
  assert.equal(contract.dailyViolation,undefined);
  assert.equal(contract.dailyDowntimeSeconds,0);
  assert.equal(contract.dailyUptimeSeconds,21600);
  dc.racks.afterThermalStep(720,2);
  assert.equal(e.thermalViolationSeconds,62);
  assert.equal(contract.dailyViolation,true);
  assert.equal(contract.dailyDowntimeSeconds,720,'only the two simulation seconds beyond the grace count as downtime');
  assert.equal(contract.dailyActiveSeconds,22320);
});

test('simulation passes physical elapsed time to the rack grace timer',()=>{
  const {world,dc,sim}=fixture(),contract={id:'thermal',status:'active',maxInletTemperature:30,availability:99.9,
    activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0,dailyActiveSeconds:0,dailyUptimeSeconds:0,dailyDowntimeSeconds:0};
  dc.state.contracts=[contract];const e=rack(world,10);e.contractId=contract.id;
  world.setTemperature(e.x,e.y-1,35);sim.step(1);
  assert.equal(e.thermalViolationSeconds,1);
  assert.equal(contract.activeSeconds,360,'contract accounting retains accelerated data-center time');
  assert.equal(contract.dailyDowntimeSeconds,0);
});

test('continuous thermal violation timer persists and old rack saves default it to zero',()=>{
  const first=fixture(),contract={id:'thermal',status:'active',maxInletTemperature:30,availability:99.9,
    activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0,dailyActiveSeconds:0,dailyUptimeSeconds:0,dailyDowntimeSeconds:0};
  first.dc.state.contracts=[contract];const e=rack(first.world,10);e.contractId=contract.id;
  first.world.setTemperature(e.x,e.y-1,31);first.dc.racks.update(45,first.dc.clock);first.dc.racks.afterThermalStep(45);
  first.dc.persist();
  const restored=fixture(first.storage),loaded=restored.world.entitiesByType('serverRack')[0];
  assert.equal(loaded.thermalViolationSeconds,45);
  restored.dc.racks.update(16,restored.dc.clock);restored.dc.racks.afterThermalStep(16);
  assert.equal(restored.dc.state.contracts[0].dailyViolation,true);
  assert.equal(restored.dc.state.contracts[0].dailyDowntimeSeconds,1);

  const key=[...first.storage.keys()][0],snapshot=JSON.parse(first.storage.get(key));
  for(const entity of snapshot.world.entities){delete entity.properties.thermalViolationSeconds;delete entity.properties.thermalViolationTimebase;}
  first.storage.set(key,JSON.stringify(snapshot));
  const legacy=fixture(first.storage);
  assert.equal(legacy.world.entitiesByType('serverRack')[0].thermalViolationSeconds,0);

  snapshot.world.entities[0].properties.thermalViolationSeconds=45;
  first.storage.set(key,JSON.stringify(snapshot));
  const migrated=fixture(first.storage);
  assert.equal(migrated.world.entitiesByType('serverRack')[0].thermalViolationSeconds,.125,'legacy game-clock seconds convert to the new simulation-time base');
  assert.equal(migrated.world.entitiesByType('serverRack')[0].thermalViolationTimebase,'simulation');
});

test('tolerated overload does not mark all contracts as SLA violations',()=>{
  const {world,dc,sim}=fixture();
  dc.state.contracts=[{id:'a',status:'active',maxInletTemperature:30,availability:99.9,activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0}];
  Object.assign(rack(world,105),{contractId:'a',maxPowerKW:105,loadProfile:'banking'});
  dc.clock.seconds=12*3600;sim.step(1/60);
  assert.equal(dc.state.contracts[0].dailyViolation,undefined);assert.equal(dc.state.contracts[0].downtimeSeconds,0);
});

test('saves restore blocked racks, breaker state and overload elapsed time',()=>{
  const first=fixture();rack(first.world,130);first.sim.step(1/60);first.dc.persist();
  const restored=fixture(first.storage);restored.sim.step(1/60);
  assert.equal(restored.world.entitiesByType('serverRack')[0].powerBlocked,true);
  assert.equal(restored.sim.metrics.powerDraw,0);assert.equal(restored.dc.powerGrid.demandKW,130);
  restored.dc.powerGrid.breakerOpen=true;restored.dc.persist();
  const general=fixture(first.storage);general.sim.step(1/60);assert.equal(general.dc.powerGrid.breakerOpen,true);
  const timer=fixture();rack(timer.world,105);timer.sim.update(.1);timer.dc.persist();
  const timed=fixture(timer.storage);assert.equal(timed.dc.powerGrid.overloadSeconds,.1);
  timed.sim.update(.1);assert.equal(timed.dc.powerGrid.overloadSeconds,.2);
});

test('legacy snapshots without protection fields are checked before generating heat',()=>{
  const first=fixture();rack(first.world,130);first.dc.persist();
  const key=[...first.storage.keys()][0],snapshot=JSON.parse(first.storage.get(key));
  delete snapshot.state.powerProtection;
  for(const entity of snapshot.world.entities){delete entity.properties.powerBlocked;delete entity.properties.requestedPower;}
  first.storage.set(key,JSON.stringify(snapshot));
  const restored=fixture(first.storage);restored.sim.step(1/60);
  assert.equal(restored.sim.metrics.powerDraw,0);assert.equal(restored.world.entities[0].heatGenerationPower,0);
});

test('cooling demand is forecast without energy effects and preserved during selective shedding',()=>{
  const {world,dc,sim}=fixture();world.fill('air',40);
  const unit=world.addEntity(new CoolingUnit(3,3));
  world.addUtility(new Duct(4,3));world.addUtility(new Duct(5,3));world.addEntity(new SupplyVent(6,3));
  rack(world,130,8,8);
  const before=Array.from(world.energy);dc.preparePowerDemand(1/60);
  assert.deepEqual(Array.from(world.energy),before);assert.ok(unit.requestedPower>0);
  const demand=unit.requestedPower;
  sim.step(1/60);assert.equal(unit.powerBlocked,false);assert.ok(unit.power>0);
  assert.ok(unit.power<=demand+1e-6);assert.ok(sim.metrics.powerDraw<=100000);
  // Infrastructure alone exceeding capacity trips before cooling or fan forces.
  dc.powerGrid.capacityKW=.001;sim.step(1/60);
  assert.equal(dc.powerGrid.breakerOpen,true);assert.equal(unit.power,0);
  assert.equal(unit.currentAirFlow,0);assert.equal(unit.currentCooling,0);assert.equal(sim.metrics.coolingDelivered,0);
});

test('dashboard exposes persistent cuts and binds manual rearm',()=>{
  const {world,dc,sim}=fixture();rack(world,130);sim.step(1/60);
  let click;
  const root={innerHTML:'',querySelectorAll:()=>[],querySelector:selector=>selector==='[data-rearm]'?{addEventListener:(_,fn)=>{click=fn;}}:null};
  const messages=[],panel=new DataCenterDashboard(root,dc,message=>messages.push(message));
  panel.update();assert.match(root.innerHTML,/CORTE SELETIVO/);assert.match(root.innerHTML,/Demanda solicitada/);
  assert.match(root.innerHTML,/Rearmar energia/);assert.equal(typeof click,'function');
  click();assert.match(messages[0],/0 racks religados; 1 continuam/);
  dc.upgradePower(250);click();assert.equal(dc.powerGrid.blockedRacks,0);
});

test('dashboard shows the physical countdown while overload is still tolerated',()=>{
  const {world,dc,sim}=fixture();rack(world,105);sim.update(.25);
  const root={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  new DataCenterDashboard(root,dc).update();
  assert.match(root.innerHTML,/SOBRECARGA/);assert.match(root.innerHTML,/Corte em 4\.8 s/);
  assert.doesNotMatch(root.innerHTML,/data-rearm/);
});

test('campaign simulations retain the previous behavior even above their power limit',()=>{
  const world=new World(6,6),level={id:'campaign-power',objectives:[],failures:[],events:[],missionDuration:Infinity,objectiveStartAt:0,powerLimit:100000,thermalSystems:{simpleCooling:false,waterCooling:false}};
  world.thermalSystems=level.thermalSystems;const e=rack(world,130),sim=new Simulation(world,level);sim.initialize();sim.step(1/60);
  assert.equal(e.powerBlocked,false);assert.equal(sim.metrics.powerDraw,130000);assert.ok(e.heatGenerationPower>0);
});
