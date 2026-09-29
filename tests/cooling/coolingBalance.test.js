import test from 'node:test';
import assert from 'node:assert/strict';
import { COOLING_UNIT_BALANCE_REVISION, COOLING_UNIT_MODELS, migrateCoolingUnitBalance } from '../../src/entities/CoolingUnitModels.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { CoolingPerformanceSolver } from '../../src/simulation/cooling/CoolingPerformanceSolver.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { World } from '../../src/world/World.js';

test('four commercial condensers cover the 18-rack reference load at 30 °C',()=>{
  const commercial=COOLING_UNIT_MODELS.commercial;
  assert.equal(commercial.ratedCoolingCapacity*4,220000);
  const solver=new CoolingPerformanceSolver();
  const unit=new CoolingUnit(0,0,{...commercial,tier:'commercial'});
  unit.outdoorTemperature=30;
  const result=solver.solve(unit,{status:'READY',paths:[{flowRate:commercial.maxAirFlow}]},35);
  assert.equal(result.capacity,52250);
  assert.equal(result.cooling,result.capacity);
  assert.ok(result.cooling*4>=169000);
  assert.equal(new CoolingUnit(0,0,{...COOLING_UNIT_MODELS.industrial,tier:'industrial'}).ratedCoolingCapacity,110000);
});

test('cooling models retain airflow, COP and fan power assumptions',()=>{
  const commercial=new CoolingUnit(0,0,{tier:'commercial'});
  const industrial=new CoolingUnit(0,0,{tier:'industrial'});
  assert.deepEqual([commercial.maxAirFlow,commercial.cop,commercial.fanPower],[6,4.5,700]);
  assert.deepEqual([industrial.maxAirFlow,industrial.cop,industrial.fanPower],[12,4.2,1400]);
  assert.equal(commercial.ratedCoolingCapacity/commercial.cop+commercial.fanPower,12922.222222222223);
});

test('save migration upgrades only exact old defaults and is idempotent',()=>{
  const legacy={tier:'commercial',ratedCoolingCapacity:25000,maxAirFlow:2.5,cop:3.5,fanPower:700,enabled:false,direction:{x:0,y:1}};
  const upgraded=migrateCoolingUnitBalance(legacy);
  assert.equal(upgraded.ratedCoolingCapacity,55000);
  assert.equal(upgraded.maxAirFlow,6);
  assert.equal(upgraded.cop,4.5);
  assert.equal(upgraded.coolingBalanceRevision,COOLING_UNIT_BALANCE_REVISION);
  assert.equal(upgraded.enabled,false);
  assert.deepEqual(upgraded.direction,{x:0,y:1});
  assert.deepEqual(migrateCoolingUnitBalance(upgraded),upgraded);

  const custom=migrateCoolingUnitBalance({...legacy,ratedCoolingCapacity:31000});
  assert.equal(custom.ratedCoolingCapacity,31000);
  assert.equal(custom.maxAirFlow,2.5);
});

test('loading an old condenser upgrades it once and preserves placement and controls on the next save',()=>{
  const saves=new DataCenterSaveSystem({storage:null}),source=new World(5,5);
  const legacy={tier:'commercial',ratedCoolingCapacity:25000,maxAirFlow:2.5,cop:3.5,fanPower:700,enabled:false,direction:{x:0,y:1}};
  const snapshot={world:{materials:Array.from(source.material),energy:Array.from(source.energy),entities:[{type:'coolingUnit',x:2,y:3,properties:legacy}],utilities:[]}};
  const loaded=new World(5,5);assert.equal(saves.restoreWorld(loaded,snapshot),true);
  const unit=loaded.entitiesByType('coolingUnit')[0];
  assert.deepEqual([unit.x,unit.y,unit.ratedCoolingCapacity,unit.maxAirFlow,unit.cop,unit.enabled,unit.direction],[2,3,55000,6,4.5,false,{x:0,y:1}]);
  const saved=saves.capture(loaded,{}, {budget:0,inventory:{},placedEntities:new Map(),placedMaterials:new Map()});
  const restored=new World(5,5);assert.equal(saves.restoreWorld(restored,saved),true);
  assert.equal(restored.entitiesByType('coolingUnit')[0].ratedCoolingCapacity,55000);
});
