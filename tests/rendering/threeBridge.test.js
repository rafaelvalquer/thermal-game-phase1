import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three';
import { CoordinateMapper } from '../../src/bridge/CoordinateMapper.js';
import { DirtyStateTracker } from '../../src/bridge/DirtyStateTracker.js';
import { WorldSnapshot } from '../../src/bridge/WorldSnapshot.js';
import { World } from '../../src/world/World.js';
import { AirDuct, ComputeRack, CoolingUnit, Fan, Pipe, ServerRack, SupplyVent } from '../../src/entities/index.js';
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

test('air duct snapshot connections include adjacent air terminals and never join hydraulic pipes',()=>{
  const world=new World(8,6),cooling=world.addEntity(new CoolingUnit(0,2)),first=world.addUtility(new AirDuct(1,2)),second=world.addUtility(new AirDuct(2,2));
  world.addEntity(new Pipe(1,1));world.addEntity(new SupplyVent(3,2));
  const snapshot=WorldSnapshot.capture(world),a=snapshot.equipment.find(record=>record.id===String(first.id)),b=snapshot.equipment.find(record=>record.id===String(second.id));
  assert.deepEqual(a.ductConnections,[{direction:'east',type:'duct'},{direction:'west',type:'coolingUnit'}]);
  assert.deepEqual(b.ductConnections,[{direction:'east',type:'supplyVent'},{direction:'west',type:'duct'}]);
  assert.equal(snapshot.equipment.find(record=>record.id===String(cooling.id)).type,'coolingUnit');
});

test('air duct snapshot classifies real straight, curve, tee, cross and terminal connections',()=>{
  const world=new World(12,8),ducts=[];
  // A straight run ending at an outlet, plus an independent corner, tee and cross.
  world.addEntity(new CoolingUnit(0,1));world.addUtility(new AirDuct(1,1));world.addUtility(new AirDuct(2,1));world.addEntity(new SupplyVent(3,1));
  world.addUtility(new AirDuct(6,1));world.addUtility(new AirDuct(7,1));world.addUtility(new AirDuct(7,2));
  world.addUtility(new AirDuct(2,5));world.addUtility(new AirDuct(3,5));world.addUtility(new AirDuct(4,5));world.addUtility(new AirDuct(3,4));
  for(const [x,y] of [[8,5],[9,5],[7,5],[8,4],[8,6]])ducts.push(world.addUtility(new AirDuct(x,y)));
  const records=WorldSnapshot.capture(world).equipment.filter(record=>record.type==='duct');
  const at=(x,y)=>records.find(record=>record.x===x&&record.y===y);
  assert.equal(at(2,1).ductShape,'straight');
  assert.equal(at(7,1).ductShape,'curve');
  assert.equal(at(3,5).ductShape,'tee');
  assert.equal(at(8,5).ductShape,'cross');
  assert.equal(at(1,1).ductConnections.some(connection=>connection.type==='coolingUnit'),true);
  assert.equal(at(2,1).ductConnections.some(connection=>connection.type==='supplyVent'),true);
  assert.equal(records.every(record=>!record.ductConnections.some(connection=>connection.type==='pipe')),true);
  assert.equal(ducts.length,5);
});

test('air duct fittings appear at a cooling unit and an outlet, then update when a terminal is removed',()=>{
  const scene=new Scene(),world=new World(7,5),duct=world.addUtility(new AirDuct(2,2));
  const cooling=world.addEntity(new CoolingUnit(1,2)),vent=world.addEntity(new SupplyVent(3,2)),factory=new Equipment3DFactory(scene);
  factory.sync(WorldSnapshot.capture(world));const couplers=factory.ducts.meshes.get('couplers'),matrix=new Matrix4();
  couplers.getMatrixAt(0,matrix);assert.notEqual(matrix.determinant(),0);
  couplers.getMatrixAt(1,matrix);assert.notEqual(matrix.determinant(),0);
  world.removeEntity(vent);assert.equal(factory.sync(WorldSnapshot.capture(world)),true);
  factory.ducts.meshes.get('couplers').getMatrixAt(0,matrix);assert.equal(matrix.determinant(),0);
  factory.ducts.meshes.get('couplers').getMatrixAt(1,matrix);assert.notEqual(matrix.determinant(),0);
  assert.equal(factory.recordAt({object:couplers,instanceId:0}),String(duct.id));assert.ok(cooling);factory.dispose();
});

test('air duct models build shared arms, caps and terminal couplers with pickable logical IDs',()=>{
  const scene=new Scene(),world=new World(8,8),ducts=[];
  for(const [x,y] of [[3,3],[4,3],[3,2],[3,4],[2,3],[6,3],[7,3],[5,3],[6,2]])ducts.push(world.addUtility(new AirDuct(x,y)));
  const factory=new Equipment3DFactory(scene);factory.sync(WorldSnapshot.capture(world));
  const arms=factory.ducts.meshes.get('arms'),caps=factory.ducts.meshes.get('caps'),couplers=factory.ducts.meshes.get('couplers');
  assert.ok(arms.geometry===factory.ducts.geometry.arm);assert.equal(arms.count,ducts.length*4);
  assert.equal(factory.recordAt({object:arms,instanceId:0}),String(ducts[0].id));
  assert.equal(arms.geometry.parameters.width,.2);
  const eastArm=new Matrix4();arms.getMatrixAt(0,eastArm);
  assert.ok(Math.abs(eastArm.elements[12]-.4-3.5)<1e-6);
  assert.ok(Math.abs(eastArm.elements[12]+.1-4)<1e-6,'east connector ends exactly at the shared tile seam');
  const connections=WorldSnapshot.capture(world).equipment;
  const crossConnections=connections.find(record=>record.id===String(ducts[0].id)).ductConnections;
  const teeConnections=connections.find(record=>record.id===String(ducts[5].id)).ductConnections;
  assert.deepEqual(crossConnections.map(connection=>connection.direction).sort(),['east','north','south','west']);
  assert.deepEqual(teeConnections.map(connection=>connection.direction).sort(),['east','north','west']);
  const matrix=new Matrix4();caps.getMatrixAt(0,matrix);assert.equal(matrix.determinant(),0);
  couplers.getMatrixAt(0,matrix);assert.equal(matrix.determinant(),0);
  const ids=factory.getEquipmentIds();assert.deepEqual(ids,factory.getMeshIds());factory.dispose();
});

test('air duct instancing updates after topology changes and preserves selection IDs when a tile is removed',()=>{
  const scene=new Scene(),world=new World(6,5),first=world.addUtility(new AirDuct(1,2)),second=world.addUtility(new AirDuct(2,2)),factory=new Equipment3DFactory(scene);
  factory.sync(WorldSnapshot.capture(world));const arms=factory.ducts.meshes.get('arms');assert.equal(arms.count,8);
  world.removeUtility(second);assert.equal(factory.sync(WorldSnapshot.capture(world)),true);
  const updatedArms=factory.ducts.meshes.get('arms');assert.notEqual(updatedArms,arms);assert.equal(updatedArms.count,4);
  assert.equal(factory.recordAt({object:updatedArms,instanceId:0}),String(first.id));assert.deepEqual(factory.getEquipmentIds(),[String(first.id)]);factory.dispose();
});

test('hydraulic pipe crossing remains above the connected air duct',()=>{
  const scene=new Scene(),world=new World(5,5);world.addUtility(new AirDuct(2,2));const pipeEntity=world.addEntity(new Pipe(2,2));
  const factory=new Equipment3DFactory(scene);factory.sync(WorldSnapshot.capture(world));
  const pipe=factory.meshes.get('pipe'),duct=factory.ducts.meshes.get('body'),pipeMatrix=new Matrix4(),ductMatrix=new Matrix4(),pipePosition=new Vector3(),ductPosition=new Vector3();
  pipe.getMatrixAt(0,pipeMatrix);duct.getMatrixAt(0,ductMatrix);pipePosition.setFromMatrixPosition(pipeMatrix);ductPosition.setFromMatrixPosition(ductMatrix);
  assert.ok(pipePosition.y-.075>ductPosition.y+.12);
  assert.equal(factory.recordAt({object:pipe,instanceId:0}),String(pipeEntity.id));factory.dispose();
});

test('world builder creates an instanced floor, grouped walls and supports ceiling visibility',()=>{
  const scene=new Scene(),world=new World(3,2);world.setMaterial(1,0,'concrete');
  const snapshot=WorldSnapshot.capture(world),builder=new World3DBuilder(scene);
  assert.equal(builder.build(snapshot),true);assert.equal(builder.floor.count,6);assert.equal(builder.walls.length,1);assert.equal(builder.walls[0].count,1);
  builder.setCeilingVisible(true);assert.equal(builder.ceiling.visible,true);assert.equal(builder.build(snapshot),false);builder.dispose();
});
