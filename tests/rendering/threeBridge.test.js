import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { CoordinateMapper } from '../../src/bridge/CoordinateMapper.js';
import { DirtyStateTracker } from '../../src/bridge/DirtyStateTracker.js';
import { WorldSnapshot } from '../../src/bridge/WorldSnapshot.js';
import { World } from '../../src/world/World.js';
import { ComputeRack, CoolingUnit, Fan, ServerRack } from '../../src/entities/index.js';
import { NavigationGrid } from '../../src/rendering/three/visual/NavigationGrid.js';
import { ThermalColorScale } from '../../src/rendering/three/visual/ThermalColorScale.js';
import { Equipment3DFactory } from '../../src/rendering/three/equipment/Equipment3DFactory.js';
import { EquipmentAnimationSystem } from '../../src/rendering/three/equipment/EquipmentAnimationSystem.js';
import { World3DBuilder } from '../../src/rendering/three/world/World3DBuilder.js';
import { FirstPersonController } from '../../src/rendering/three/controllers/FirstPersonController.js';
import { Game } from '../../src/game/Game.js';

test('CoordinateMapper centralizes tile centers, inverse mapping, map center, and direction yaw',()=>{
  const mapper=new CoordinateMapper(1);
  assert.deepEqual(mapper.tileCenter(10,20),{x:10.5,y:0,z:20.5});
  assert.deepEqual(mapper.worldToTile(10.99,20.01),{x:10,y:20});
  assert.deepEqual(mapper.mapCenter(112,72),{x:56,y:0,z:36});
  assert.equal(mapper.directionToYaw({x:1,y:0}),-Math.PI/2);
});

test('WorldSnapshot maps the existing world and equipment IDs without creating parallel entities',()=>{
  const world=new World(8,6),rack=world.addEntity(new ComputeRack(2,3,{specialization:'gpu',modelId:'enterprise',currentPowerW:12000,utilization:.5}));
  const fan=world.addEntity(new Fan(1,1));fan.airflow=2.5;fan.power=700;
  const datacenter={state:{contracts:[{id:'cloud-a',clientName:'AI Co',modality:'compute',status:'active',allocations:[{assetId:rack.assetId}]}]},land:null,powerGrid:{capacityKW:100}};
  const snapshot=WorldSnapshot.capture(world,{metrics:{powerDraw:12700,averageTemperature:26,maxAirTemp:34}},datacenter,{version:7});
  assert.equal(snapshot.version,7);assert.equal(snapshot.world.width,8);assert.equal(snapshot.world.height,6);
  const gpu=snapshot.equipment.find(item=>item.id===rack.assetId);
  assert.equal(gpu.runtimeId,rack.id);assert.equal(gpu.specialization,'gpu');assert.deepEqual(gpu.contractIds,['cloud-a']);assert.equal(gpu.powerKW,12);assert.equal(gpu.utilization,.5);
  assert.equal(gpu.occupancy,.5);assert.equal(gpu.ratedPowerKW,36);assert.equal(gpu.inletAirTemperature,25);
  assert.equal(snapshot.equipment.find(item=>item.runtimeId===fan.id).airflow,2.5);assert.equal(snapshot.metrics.powerKW,12.7);
  assert.equal(Object.hasOwn(gpu,'source'),false);
});

test('DirtyStateTracker observes world topology changes and clears consumed events',()=>{
  const world=new World(5,5),tracker=new DirtyStateTracker();tracker.observe(world);assert.equal(tracker.isDirty(),true);tracker.consume();assert.equal(tracker.isDirty(),false);
  world.addEntity(new ServerRack(2,2));tracker.observe(world);assert.equal(tracker.isDirty(),true);assert.ok(tracker.consume().reasons.includes('entityVisualVersion'));
  assert.equal(tracker.isDirty(),false);
});

test('NavigationGrid blocks solid tiles and equipment, and respects purchased land',()=>{
  const world=new World(8,6),rack=world.addEntity(new ServerRack(3,2));world.setMaterial(1,1,'wall');
  const ownership={isOwned:(x,y)=>x>=2&&y>=1&&x<7&&y<5};world.landOwnership=ownership;
  const grid=new NavigationGrid(world);
  assert.equal(grid.isWalkable(1,1),false);assert.equal(grid.isWalkable(3,2),false);assert.equal(grid.isWalkable(2,2),true);assert.equal(grid.isWalkable(7,2),false);
  assert.equal(grid.canOccupy(3.5,2.5),false);assert.equal(world.entities.includes(rack),true);
});

test('first person spawn stays at eye height and selects a walkable owned tile when map center is blocked',()=>{
  const world=new World(8,6);for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++)world.setMaterial(x,y,'concrete');
  world.setMaterial(3,2,'air');world.setMaterial(4,2,'air');world.landOwnership={isOwned:(x,y)=>x>=2&&x<=5&&y>=1&&y<=4};
  const controller=Object.create(FirstPersonController.prototype);controller.radius=.22;controller.grid=new NavigationGrid(world);
  const spawn=controller.findSafeSpawn(world,4.5,3.5);
  assert.ok(spawn);assert.equal(controller.grid.canOccupy(spawn.x,spawn.z,.22),true);assert.equal(spawn.x,4.5);assert.equal(spawn.z,2.5);
  const camera=new PerspectiveCamera();const position={x:spawn.x,y:1.65,z:spawn.z};camera.position.set(position.x,position.y,position.z);
  assert.equal(camera.position.y,1.65);
});

test('first person uses WASD movement at one speed and remains blocked by navigation grid',()=>{
  const move=keys=>{const controller=Object.create(FirstPersonController.prototype);controller.camera=new PerspectiveCamera();controller.controls={isLocked:true};controller.keys=new Set(keys);controller.speed=3.2;controller.radius=.22;controller.grid={canOccupy:()=>true};controller.update(.05);return controller.camera.position.clone();};
  const normal=move(['KeyW']),withShift=move(['KeyW','ShiftLeft']);
  assert.ok(normal.z<0);assert.equal(normal.distanceTo(withShift),0);
  const blocked=Object.create(FirstPersonController.prototype);blocked.camera=new PerspectiveCamera();blocked.controls={isLocked:true};blocked.keys=new Set(['KeyW']);blocked.speed=3.2;blocked.radius=.22;blocked.grid={canOccupy:(x,z)=>z===0};blocked.update(.05);assert.equal(blocked.camera.position.z,0);
});

test('overview is no longer a selectable view and falls back to 2D construction',()=>{
  const game={viewMode:'walk',canvas:{hidden:true,focus(){}},threeView:{setVisible(){} }};
  assert.equal(Game.prototype.setViewMode.call(game,'overview'),true);assert.equal(game.viewMode,'2d');assert.equal(game.canvas.hidden,false);
});

test('thermal color scale interpolates the simulation temperature palette',()=>{
  assert.equal(ThermalColorScale.colorAt(18).getHexString(),'168aad');
  assert.equal(ThermalColorScale.colorAt(42).getHexString(),'dc2626');
  assert.notEqual(ThermalColorScale.colorAt(33).getHexString(),'34d399');
});

test('CoordinateMapper direction yaw points equipment along the logical grid direction',()=>{
  const mapper=new CoordinateMapper();
  assert.equal(mapper.directionToYaw({x:0,y:-1}),0);
  assert.equal(mapper.directionToYaw({x:1,y:0}),-Math.PI/2);
  assert.equal(mapper.directionToYaw({x:0,y:1}),Math.PI);
});

test('equipment factory keeps a one-to-one ID view map and removes deleted world assets',()=>{
  const scene=new Scene(),world=new World(6,6),cpu=world.addEntity(new ComputeRack(1,1,{specialization:'cpu'})),rack=world.addEntity(new ServerRack(3,2));
  const snapshot=WorldSnapshot.capture(world,null,null,{version:1}),factory=new Equipment3DFactory(scene);
  assert.equal(factory.sync(snapshot),true);assert.deepEqual(factory.getEquipmentIds(),[cpu.assetId,String(rack.id)].sort());
  const mesh=[...factory.getPickableMeshes()].find(item=>item.name==='equipment-computeRackCpu');assert.ok(mesh);assert.equal(mesh.count,1);assert.equal(factory.recordAt({object:mesh,instanceId:0}),cpu.assetId);
  world.removeEntity(rack);const next=WorldSnapshot.capture(world,null,null,{version:2});assert.equal(factory.sync(next),true);assert.deepEqual(factory.getEquipmentIds(),[cpu.assetId]);factory.dispose();
});

test('detailed rack types use distinct front layouts, shared geometry and selectable part IDs',()=>{
  const scene=new Scene(),world=new World(8,6);
  const cpu=world.addEntity(new ComputeRack(1,1,{specialization:'cpu'})),gpu=world.addEntity(new ComputeRack(2,1,{specialization:'gpu'})),storage=world.addEntity(new ComputeRack(3,1,{specialization:'storage'}));
  const factory=new Equipment3DFactory(scene);factory.sync(WorldSnapshot.capture(world));
  const cpuModule=factory.detailed.meshes.get('computeRackCpu:module'),gpuModule=factory.detailed.meshes.get('computeRackGpu:module'),storageModule=factory.detailed.meshes.get('computeRackStorage:module');
  assert.equal(cpuModule.count,12);assert.equal(gpuModule.count,6);assert.equal(storageModule.count,10);
  assert.equal(cpuModule.geometry,gpuModule.geometry);assert.equal(gpuModule.geometry,storageModule.geometry);
  assert.ok(factory.detailed.meshes.has('computeRackGpu:gpu-fans'));assert.ok(factory.detailed.meshes.has('computeRackStorage:drive-bays'));
  assert.equal(factory.recordAt({object:cpuModule,instanceId:5}),cpu.assetId);
  assert.equal(factory.recordAt({object:gpuModule,instanceId:3}),gpu.assetId);
  assert.equal(factory.recordAt({object:storageModule,instanceId:8}),storage.assetId);
  assert.deepEqual(factory.getEquipmentIds(),factory.getMeshIds());factory.dispose();
});

test('industrial condenser occupies its two-tile direction and animated rotors follow actual airflow',()=>{
  const scene=new Scene(),world=new World(8,6),unit=world.addEntity(new CoolingUnit(2,2,{tier:'industrial',direction:{x:1,y:0}}));
  unit.currentAirFlow=6;unit.fanSpeed=.5;unit.fanActive=true;unit.status='READY';
  const factory=new Equipment3DFactory(scene),animation=new EquipmentAnimationSystem();
  let snapshot=WorldSnapshot.capture(world);factory.sync(snapshot);
  const body=factory.detailed.meshes.get('coolingUnitIndustrial'),blades=factory.detailed.meshes.get('coolingUnitIndustrial:fan-blade');
  assert.equal(blades.count,8);const matrix=new Matrix4(),position=new Vector3();body.getMatrixAt(0,matrix);position.setFromMatrixPosition(matrix);assert.equal(position.x,3);assert.equal(position.z,2.5);
  blades.getMatrixAt(0,matrix);const before=matrix.elements.slice();animation.update(snapshot,.1,factory);blades.getMatrixAt(0,matrix);const running=matrix.elements.slice();assert.notDeepEqual(running,before);
  unit.currentAirFlow=0;unit.fanSpeed=0;unit.fanActive=false;snapshot=WorldSnapshot.capture(world);factory.sync(snapshot);animation.update(snapshot,.1,factory);blades.getMatrixAt(0,matrix);assert.deepEqual(matrix.elements,running);
  animation.dispose();factory.dispose();
});

test('status LEDs respond to normal, alarm and power-off states and shared resources dispose once',()=>{
  const scene=new Scene(),world=new World(5,5),rack=world.addEntity(new ServerRack(2,2,{cpuLoad:.5})),factory=new Equipment3DFactory(scene),color=new Color();
  factory.sync(WorldSnapshot.capture(world));const leds=factory.detailed.meshes.get('serverRack:led');
  leds.getColorAt(0,color);assert.equal(color.getHexString(),'4ade80');
  rack.status='HOT';factory.sync(WorldSnapshot.capture(world));leds.getColorAt(0,color);assert.equal(color.getHexString(),'ff4055');
  rack.enabled=false;factory.sync(WorldSnapshot.capture(world));leds.getColorAt(0,color);assert.equal(color.getHexString(),'17232c');
  let geometryDisposals=0;factory.detailed.geometries.box.addEventListener('dispose',()=>geometryDisposals++);factory.dispose();assert.equal(geometryDisposals,1);
});

test('fifty racks keep a fixed number of instanced draw groups across live updates',()=>{
  const scene=new Scene(),world=new World(12,8),racks=[];
  for(let y=1;y<=5;y++)for(let x=1;x<=10;x++)racks.push(world.addEntity(new ComputeRack(x,y,{specialization:'cpu'})));
  const factory=new Equipment3DFactory(scene);factory.sync(WorldSnapshot.capture(world));
  const groups=factory.getPickableMeshes(),moduleMesh=factory.detailed.meshes.get('computeRackCpu:module');
  assert.equal(moduleMesh.count,50*12);assert.ok(groups.length<20);
  for(let i=0;i<8;i++){racks[i].setUtilization((i+1)/10);factory.sync(WorldSnapshot.capture(world));}
  assert.equal(factory.getPickableMeshes().length,groups.length);assert.equal(factory.detailed.meshes.get('computeRackCpu:module'),moduleMesh);
  factory.dispose();
});

test('world builder creates an instanced floor, grouped walls and supports ceiling visibility',()=>{
  const scene=new Scene(),world=new World(3,2);world.setMaterial(1,0,'concrete');
  const snapshot=WorldSnapshot.capture(world),builder=new World3DBuilder(scene);
  assert.equal(builder.build(snapshot),true);assert.equal(builder.floor.count,6);assert.equal(builder.walls.length,1);assert.equal(builder.walls[0].count,1);
  builder.setCeilingVisible(true);assert.equal(builder.ceiling.visible,true);assert.equal(builder.build(snapshot),false);builder.dispose();
});
