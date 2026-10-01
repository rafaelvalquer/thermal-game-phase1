import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { datacenterSandbox } from '../../src/campaign/datacenterSandbox.js';
import { LandOwnershipSystem } from '../../src/datacenter/land/LandOwnershipSystem.js';
import { PlacementValidator } from '../../src/building/PlacementValidator.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { AirGrid } from '../../src/simulation/air/AirGrid.js';
import { Fan } from '../../src/entities/Fan.js';
import { AirflowSystem } from '../../src/simulation/air/AirflowSystem.js';
import { FluidSystem } from '../../src/simulation/FluidSystem.js';

test('sandbox land areas cover the 128×80 world and begin with only the 64×48 core',()=>{
  const world=new World(128,80),system=new LandOwnershipSystem(world,datacenterSandbox.datacenter.land,{});
  assert.equal(system.ownedTileCount(),64*48);
  assert.equal(datacenterSandbox.datacenter.land.areas.reduce((sum,area)=>sum+area.width*area.height,0),128*80);
  assert.equal(system.isOwned(32,16),true);assert.equal(system.isOwned(31,16),false);
});

test('land expansion requires adjacency, rejects repeat purchases and unlocks exact area',()=>{
  const world=new World(128,80),system=new LandOwnershipSystem(world,datacenterSandbox.datacenter.land,{});
  assert.equal(system.unlockArea('west').ok,true);assert.equal(system.ownedTileCount(),64*48+32*48);
  assert.equal(system.unlockArea('west').reason,'AREA_UNAVAILABLE');
  const isolated=new LandOwnershipSystem(world,{initialArea:'core',areas:[{id:'core',x:32,y:16,width:64,height:48},{id:'far',x:0,y:0,width:8,height:8}]},{});
  assert.equal(isolated.unlockArea('far').reason,'AREA_NOT_ADJACENT');
  assert.equal(system.availableExpansions().find(area=>area.id==='east-1').available,true);
});

test('placement rejects locked tiles and industrial footprints crossing ownership',()=>{
  const world=new World(128,80);world.datacenterConfig=datacenterSandbox.datacenter;world.landOwnership=new LandOwnershipSystem(world,datacenterSandbox.datacenter.land,{});
  const validator=new PlacementValidator(world);
  assert.deepEqual(validator.validatePlacement('fan',31,20).reason,'LAND_LOCKED');
  assert.equal(validator.validatePlacement('fan',40,20).ok,true);
  assert.equal(validator.validatePlacement('industrialCoolingUnit',95,20,{direction:{x:1,y:0},footprintLength:2}).reason,'LAND_LOCKED');
  assert.equal(validator.validatePlacement('industrialCoolingUnit',94,20,{direction:{x:1,y:0},footprintLength:2}).ok,true);
});

test('legacy 112×72 save migrates temperatures and player materials without restoring fixed room walls',()=>{
  const old=new World(112,72);old.setTemperature(30,30,38);old.setMaterial(20,20,'concrete');old.addEntity(new Fan(100,20,{x:1,y:0}));
  const saves=new DataCenterSaveSystem({storage:null,indexedDB:null}),snapshot=saves.capture(old,{}, {budget:123,inventory:{},placedEntities:new Map(),placedMaterials:new Map([[old.index(20,20),{tool:'wall',cost:100}]] )});
  delete snapshot.world.width;delete snapshot.world.height;
  const migrated=new World(128,80);assert.equal(saves.restoreWorld(migrated,snapshot,{migrateOpenTerrain:true}),true);
  assert.equal(migrated.isAir(2,3),true);assert.equal(migrated.isAir(17,10),true);
  assert.equal(migrated.materialAt(20,20).id,'concrete');assert.ok(Math.abs(migrated.temperatureAt(30,30)-38)<1e-6);
  const state={},land=new LandOwnershipSystem(migrated,datacenterSandbox.datacenter.land,state);land.migrate(state,snapshot);
  assert.ok(state.ownedLandAreas.includes('west'));assert.ok(state.ownedLandAreas.includes('east-1'));
  assert.equal(migrated.entitiesByType('fan').length,1);
});

test('air topology treats locked open land as exterior and retains player-built room enclosure',()=>{
  const world=new World(8,8),definition={initialArea:'all',areas:[{id:'all',x:0,y:0,width:8,height:8}]};
  world.landOwnership=new LandOwnershipSystem(world,definition,{});
  for(let x=2;x<=5;x++){world.setMaterial(x,2,'concrete');world.setMaterial(x,5,'concrete');}
  for(let y=2;y<=5;y++){world.setMaterial(2,y,'concrete');world.setMaterial(5,y,'concrete');}
  const grid=new AirGrid(world);grid.syncTopology(true);
  assert.equal(grid.exteriorCells[world.index(0,0)],1);
  assert.equal(grid.exteriorCells[world.index(3,3)],0);
});

test('water radiators use actual wall enclosure as the exterior boundary in the open sandbox',()=>{
  const world=new World(8,8);world.landOwnership=new LandOwnershipSystem(world,{initialArea:'all',areas:[{id:'all',x:0,y:0,width:8,height:8}]},{});
  for(let x=2;x<=5;x++){world.setMaterial(x,2,'concrete');world.setMaterial(x,5,'concrete');}
  for(let y=2;y<=5;y++){world.setMaterial(2,y,'concrete');world.setMaterial(5,y,'concrete');}
  new AirflowSystem(world,{});const fluid=new FluidSystem(world,{});
  assert.equal(fluid.radiatorIsOutdoor({x:3,y:3,outdoor:true}),false);
  assert.equal(fluid.radiatorIsOutdoor({x:1,y:1,outdoor:false}),true);
});
