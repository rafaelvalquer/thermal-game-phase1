import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { Radiator } from '../../src/entities/Radiator.js';
import { AirGrid } from '../../src/simulation/air/AirGrid.js';
import { AirflowSystem } from '../../src/simulation/air/AirflowSystem.js';
import { CoolingHeatRejection } from '../../src/simulation/cooling/CoolingHeatRejection.js';
import { FluidSystem } from '../../src/simulation/FluidSystem.js';
import { ThermalSystem } from '../../src/simulation/ThermalSystem.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';

const encircle=(world,x0,y0,x1,y1)=>{
  for(let x=x0;x<=x1;x++){world.setMaterial(x,y0,'concrete');world.setMaterial(x,y1,'concrete');}
  for(let y=y0;y<=y1;y++){world.setMaterial(x0,y,'concrete');world.setMaterial(x1,y,'concrete');}
};

test('ENV-001 open map cells are all exterior and topology is cached until physical topology changes',()=>{
  const world=new World(7,5),topology=world.environmentTopology;
  assert.equal(topology.ensureCurrent(),true);assert.equal(topology.exteriorCount,world.size);assert.equal(topology.interiorCount,0);
  const revision=topology.revision;assert.equal(topology.ensureCurrent(),false);assert.equal(topology.revision,revision);
  world.setMaterial(3,2,'concrete');assert.equal(topology.ensureCurrent(),true);assert.equal(topology.isSolid(3,2),true);
});

test('ENV-002 sealed room is interior; land ownership and room metadata do not decide it',()=>{
  const world=new World(9,9);encircle(world,2,2,6,6);world.airRooms=[{x:0,y:0,w:9,h:9}];
  world.landOwnership={isOwned:()=>false};
  assert.equal(world.environmentTopology.isInterior(3,3),true);assert.equal(world.environmentTopology.isExterior(1,1),true);
});

test('buying or rebuilding land ownership does not change environmental classification',async()=>{
  const { LandOwnershipSystem }=await import('../../src/datacenter/land/LandOwnershipSystem.js');
  const world=new World(8,8),topology=world.environmentTopology;topology.ensureCurrent();const revision=topology.revision;
  new LandOwnershipSystem(world,{initialArea:'core',areas:[{id:'core',x:0,y:0,width:4,height:8},{id:'east',x:4,y:0,width:4,height:8}]},{ownedLandAreas:['core']}).unlockArea('east');
  assert.equal(topology.ensureCurrent(),false);assert.equal(topology.revision,revision);assert.equal(topology.isExterior(6,3),true);
});

test('ENV-003 opening one wall connects the whole room to exterior air',()=>{
  const world=new World(9,9);encircle(world,2,2,6,6);
  assert.equal(world.environmentTopology.isInterior(3,3),true);
  world.setMaterial(4,2,'air');
  assert.equal(world.environmentTopology.isExterior(3,3),true);
});

test('ENV-004 closing an opening isolates the room again',()=>{
  const world=new World(9,9);encircle(world,2,2,6,6);world.setMaterial(4,2,'air');
  assert.equal(world.environmentTopology.isExterior(3,3),true);
  world.setMaterial(4,2,'concrete');assert.equal(world.environmentTopology.isInterior(3,3),true);
});

test('ENV-005 removing a wall invalidates classification and reconnects the room',()=>{
  const world=new World(9,9);encircle(world,2,2,6,6);world.environmentTopology.ensureCurrent();
  const revision=world.environmentTopology.revision;world.setMaterial(2,4,'air');world.environmentTopology.ensureCurrent();
  assert.ok(world.environmentTopology.revision>revision);assert.equal(world.environmentTopology.isExterior(4,4),true);
});

test('ENV-006 condenser on open terrain exports rejected heat to ambient',()=>{
  const world=new World(9,9),unit=world.addEntity(new CoolingUnit(4,4)),metrics={generatedHeat:0,externalEnergy:0,coolingHeatRejected:0};
  const rejection=new CoolingHeatRejection(world,metrics);rejection.queue(unit,1200);rejection.apply(2);
  assert.equal(unit.indoor,false);assert.equal(world.environment.energyReceived,2400);assert.equal(metrics.externalEnergy,2400);
});

test('ENV-007 condenser inside a sealed room returns rejected heat to room air',()=>{
  const world=new World(9,9);encircle(world,2,2,6,6);const unit=world.addEntity(new CoolingUnit(3,3)),metrics={generatedHeat:0,externalEnergy:0,coolingHeatRejected:0};
  const rejection=new CoolingHeatRejection(world,metrics);rejection.queue(unit,1200);rejection.apply(2);
  assert.equal(unit.indoor,true);assert.equal(world.environment.energyReceived,0);assert.ok(world.temperatureAt(4,3)>25);
});

test('ENV-008 exterior radiator rejects heat to ambient even without land ownership',()=>{
  const world=new World(9,9),radiator=world.addEntity(new Radiator(4,4)),fluid=new FluidSystem(world,{externalEnergy:0});
  radiator.enabled=true;radiator.energy*=2;
  const before=world.environment.energyReceived;fluid.radiate(1);
  assert.equal(fluid.radiatorIsOutdoor(radiator),true);assert.ok(world.environment.energyReceived>before);assert.equal(world.temperatureAt(4,4),25);
});

test('ENV-009 radiator in a sealed room warms nearby air instead of exporting heat',()=>{
  const world=new World(9,9);encircle(world,2,2,6,6);const radiator=world.addEntity(new Radiator(3,3)),fluid=new FluidSystem(world,{externalEnergy:0});
  radiator.enabled=true;radiator.energy*=2;
  const before=world.totalTileEnergy();fluid.radiate(1);
  assert.equal(fluid.radiatorIsOutdoor(radiator),false);assert.equal(world.environment.energyReceived,0);assert.ok(world.totalTileEnergy()>before);
});

test('ENV-010 save and reload preserve interior and exterior classification',()=>{
  const source=new World(9,9);encircle(source,2,2,6,6);source.environmentTopology.ensureCurrent();
  const saves=new DataCenterSaveSystem({storage:null,indexedDB:null}),snapshot=saves.capture(source,{}, {budget:0,inventory:{},placedEntities:new Map(),placedMaterials:new Map()}),restored=new World(9,9);
  assert.equal(saves.restoreWorld(restored,snapshot),true);
  assert.equal(restored.environmentTopology.isInterior(3,3),true);assert.equal(restored.environmentTopology.isExterior(1,1),true);
  assert.deepEqual([...restored.environmentTopology.exteriorMask],[...source.environmentTopology.exteriorMask]);
});

test('outdoor heat exchange acts across all connected exterior air and remains bounded',()=>{
  const world=new World(7,7);world.environment.temperature=25;world.setTemperature(3,3,40);
  const thermal=new ThermalSystem(world,{externalEnergy:0});thermal.passiveOutdoorExchange(1);
  assert.ok(world.temperatureAt(3,3)<40);assert.ok(world.environment.energyReceived>0);
  const enclosed=new World(7,7);encircle(enclosed,1,1,5,5);enclosed.setTemperature(3,3,40);
  new ThermalSystem(enclosed,{externalEnergy:0}).passiveOutdoorExchange(1);
  assert.equal(enclosed.temperatureAt(3,3),40);assert.equal(enclosed.environment.energyReceived,0);
});

test('air grid consumes the shared solid/exterior topology instead of land ownership',()=>{
  const world=new World(7,7);encircle(world,1,1,5,5);world.landOwnership={isOwned:()=>false};
  const grid=new AirGrid(world);grid.syncTopology();
  assert.equal(grid.exteriorCells[world.index(2,2)],0);assert.equal(grid.solid[world.index(1,1)],1);
  assert.equal(grid.exteriorCells[world.index(0,0)],1);
  new AirflowSystem(world,{});
});
