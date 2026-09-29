import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { TILE_VOLUME } from '../../src/utils/Constants.js';

test('spatial and type indexes track 200 additions and removals',()=>{
  const world=new World(40,8),racks=[];
  for(let i=0;i<200;i++){const rack=world.addEntity(new ServerRack(i%40,Math.floor(i/40)));racks.push(rack);assert.equal(world.entityAt(rack.x,rack.y),rack);}
  assert.equal(world.entitiesByType('serverRack').length,200);assert.equal(world.entitySetByType('serverRack').size,200);
  for(const rack of racks.filter((_,index)=>index%2===0)){world.removeEntity(rack);assert.equal(world.entityAt(rack.x,rack.y),undefined);}
  assert.equal(world.entitiesByType('serverRack').length,100);
});

test('restoring a save rebuilds spatial and type indexes for entities and utilities',()=>{
  const source=new World(10,6),vent=source.addEntity(new SupplyVent(3,2));
  const save=new DataCenterSaveSystem({storage:null}),snapshot=save.capture(source,{}, {budget:0,inventory:{},placedEntities:new Map(),placedMaterials:new Map()}),restored=new World(10,6);
  save.restoreWorld(restored,snapshot);
  assert.equal(restored.entityAt(3,2).type,'supplyVent');assert.equal(restored.entitiesByType('supplyVent').length,1);
  assert.notEqual(restored.entityAt(3,2),vent);
});

test('material property cache stays exact through edits, fills, and save restoration',()=>{
  const world=new World(4,3);world.setMaterial(1,1,'copper');world.setTemperature(1,1,80);
  const copper=world.registry.get('copper');
  assert.equal(world.thermalConductivity[world.index(1,1)],copper.conductivity);
  assert.equal(world.capacityAtIndex(world.index(1,1)),copper.density*TILE_VOLUME*copper.heatCapacity);
  assert.equal(world.isAirIndex(world.index(0,0)),true);
  world.setMaterial(0,0,'concrete');assert.equal(world.isAirIndex(world.index(0,0)),false);
  world.fill('water',22);assert.ok(Array.from(world.airMaterial).every(value=>value===0));

  const saves=new DataCenterSaveSystem({storage:null}),snapshot=saves.capture(world,{}, {budget:0,inventory:{},placedEntities:new Map(),placedMaterials:new Map()}),restored=new World(4,3);
  const priorThermalVersion=restored.thermalStatisticsVersion;saves.restoreWorld(restored,snapshot);
  assert.ok(restored.thermalStatisticsVersion>priorThermalVersion,'loading materials invalidates cached air-temperature indices');
  for(let i=0;i<restored.size;i++){
    const material=restored.registry.fromIndex(restored.material[i]);
    assert.equal(restored.thermalConductivity[i],material.conductivity);
    assert.equal(restored.capacityAtIndex(i),Math.max(.001,material.density*TILE_VOLUME*material.heatCapacity));
    assert.equal(restored.isAirIndex(i),material.id==='air');
  }
});
