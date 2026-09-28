import test from 'node:test';
import assert from 'node:assert/strict';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { HeatExchanger } from '../../src/entities/HeatExchanger.js';
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
  assert.equal(exchanger.ua,2250);assert.equal(exchanger.airUA,2250);
  assert.equal(exchanger.thermalTransferRevision,HeatExchanger.PERFORMANCE_REVISION);
  assert.equal(exchanger.energy,waterEnergy);

  exchanger.ua=2600;exchanger.airUA=2450;
  const updatedSnapshot=capture(source),restored=new World(5,5);
  saveSystem.restoreWorld(restored,updatedSnapshot);
  const reloaded=restored.entitiesByType('exchanger')[0];
  assert.equal(reloaded.ua,2600);assert.equal(reloaded.airUA,2450);
  assert.equal(reloaded.thermalTransferRevision,HeatExchanger.PERFORMANCE_REVISION);
});
