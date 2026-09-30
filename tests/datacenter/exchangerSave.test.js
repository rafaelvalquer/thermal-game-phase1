import test from 'node:test';
import assert from 'node:assert/strict';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { HeatExchanger } from '../../src/entities/HeatExchanger.js';
import { Radiator } from '../../src/entities/Radiator.js';
import { WaterChiller } from '../../src/entities/WaterChiller.js';
import { World } from '../../src/world/World.js';

const saveSystem=new DataCenterSaveSystem({storage:null});

function capture(world){
  return saveSystem.capture(world,{}, {budget:0,inventory:{},placedEntities:new Map(),placedMaterials:new Map()});
}

test('legacy exchanger saves receive stronger UA once and new saves preserve it',()=>{
  const source=new World(5,5),waterEnergy=10*4186*37;
  const legacy={version:1,world:{materials:Array.from(source.material),energy:Array.from(source.energy),entities:[{
    type:'exchanger',x:2,y:2,properties:{waterMass:10,energy:waterEnergy,ua:1500,airUA:1500},
  }],utilities:[]}};
  saveSystem.restoreWorld(source,legacy);
  const exchanger=source.entitiesByType('exchanger')[0];
  assert.equal(exchanger.ua,6000);assert.equal(exchanger.airUA,1800);
  assert.equal(exchanger.thermalTransferRevision,HeatExchanger.PERFORMANCE_REVISION);
  assert.equal(exchanger.energy,waterEnergy);

  exchanger.ua=2600;exchanger.airUA=2450;
  const updatedSnapshot=capture(source),restored=new World(5,5);
  saveSystem.restoreWorld(restored,updatedSnapshot);
  const reloaded=restored.entitiesByType('exchanger')[0];
  assert.equal(reloaded.ua,2600);assert.equal(reloaded.airUA,2450);
  assert.equal(reloaded.thermalTransferRevision,HeatExchanger.PERFORMANCE_REVISION);
});

test('legacy radiator saves migrate to the new fan-coil rating and infer perimeter placement',()=>{
  const source=new World(5,5),legacy={version:1,world:{materials:Array.from(source.material),energy:Array.from(source.energy),entities:[{
    type:'radiator',x:4,y:2,properties:{waterMass:12,energy:12*4186*42,ua:1400,power:0},
  }],utilities:[]}};
  saveSystem.restoreWorld(source,legacy);
  const radiator=source.entitiesByType('radiator')[0];
  assert.equal(radiator.ua,Radiator.WATER_UA);assert.equal(radiator.ratedCapacity,Radiator.RATED_CAPACITY);
  assert.equal(radiator.power,Radiator.FAN_POWER);assert.equal(radiator.outdoor,true);
  radiator.ua=6200;radiator.outdoor=false;
  const restored=new World(5,5);saveSystem.restoreWorld(restored,capture(source));
  assert.equal(restored.entitiesByType('radiator')[0].ua,6200);assert.equal(restored.entitiesByType('radiator')[0].outdoor,false);
});

test('water chiller preserves stored water, target, and COP through saves',()=>{
  const source=new World(5,5),chiller=new WaterChiller(2,2);chiller.energy=chiller.waterMass*4186*19;chiller.targetTemperature=14;chiller.cop=3.8;source.addEntity(chiller);
  const snapshot=capture(source),restored=new World(5,5);saveSystem.restoreWorld(restored,snapshot);
  const loaded=restored.entitiesByType('waterChiller')[0];
  assert.equal(loaded.waterTemperature,19);assert.equal(loaded.targetTemperature,14);assert.equal(loaded.cop,3.8);
});
