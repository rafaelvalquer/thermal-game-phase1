import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { BuildSystem } from '../../src/building/BuildSystem.js';
import { Simulation } from '../../src/simulation/Simulation.js';
import { ThermalSystem } from '../../src/simulation/ThermalSystem.js';
import { ComputeRack } from '../../src/entities/ComputeRack.js';
import { COMPUTE_RACK_MODELS } from '../../src/entities/ComputeRackModels.js';
import { Inspector } from '../../src/ui/Inspector.js';
import { DataCenterSaveSystem } from '../../src/datacenter/DataCenterSaveSystem.js';
import { createLevelEntity } from '../../src/campaign/LevelManager.js';
import { spriteIdFor, validateSpriteManifest } from '../../src/rendering/sprites/SpriteManifest.js';
import { ComputeCapacitySystem } from '../../src/datacenter/compute/ComputeCapacitySystem.js';
import { ComputeAllocationSystem } from '../../src/datacenter/compute/ComputeAllocationSystem.js';
import { ComputeLoadSystem } from '../../src/datacenter/compute/ComputeLoadSystem.js';
import { ComputeSlaSystem } from '../../src/datacenter/compute/ComputeSlaSystem.js';
import { computeFinancialPreview } from '../../src/datacenter/contracts/ContractFinancialPreview.js';

const level={id:'compute-rack-test',thermalSystems:{simpleCooling:true,waterCooling:true,allBuildTools:true},objectives:[],failures:[],events:[],missionDuration:Infinity,powerLimit:100000};
const dcConfig={allBuildTools:true,serverHall:{x:1,y:1,width:18,height:18}};
const metrics=()=>({generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0});
const sandbox=()=>{const world=new World(20,20);world.thermalSystems=level.thermalSystems;world.datacenterConfig=dcConfig;const sim=new Simulation(world,level),build=new BuildSystem(world,sim,{budget:1_000_000});return {world,sim,build};};

test('compute rack catalogue exposes all nine CPU, GPU and Storage models with the specified capacities',()=>{
  assert.deepEqual(COMPUTE_RACK_MODELS.cpu.basic.capacity,{vcpu:64,ramGB:256,frequencyGHz:3});
  assert.deepEqual(COMPUTE_RACK_MODELS.cpu.professional.capacity,{vcpu:128,ramGB:512,frequencyGHz:3});
  assert.deepEqual(COMPUTE_RACK_MODELS.cpu.enterprise.capacity,{vcpu:256,ramGB:1024,frequencyGHz:3});
  assert.deepEqual(COMPUTE_RACK_MODELS.gpu.basic.capacity,{gpuCount:2,vramPerGpuGB:24,vramGB:48});
  assert.deepEqual(COMPUTE_RACK_MODELS.gpu.professional.capacity,{gpuCount:4,vramPerGpuGB:48,vramGB:192});
  assert.deepEqual(COMPUTE_RACK_MODELS.gpu.enterprise.capacity,{gpuCount:8,vramPerGpuGB:80,vramGB:640});
  assert.deepEqual(COMPUTE_RACK_MODELS.storage.basic.capacity,{storageTB:50});
  assert.deepEqual(COMPUTE_RACK_MODELS.storage.professional.capacity,{storageTB:200});
  assert.deepEqual(COMPUTE_RACK_MODELS.storage.enterprise.capacity,{storageTB:500});
  for(const models of Object.values(COMPUTE_RACK_MODELS))for(const model of Object.values(models))assert.ok(model.cost>0&&model.maxPowerW>model.idlePowerW&&model.mass>0&&model.heatCapacity>0);
});

test('only Data Center builds expose the three computational rack tools',()=>{
  const campaign=new BuildSystem(new World(10,10),{totalInternalEnergy:()=>0},{budget:100000});
  assert.equal(campaign.catalog.computeRackCpu,undefined);assert.equal(campaign.catalog.computeRackGpu,undefined);assert.equal(campaign.catalog.computeRackStorage,undefined);
  const {build}=sandbox();
  for(const tool of ['computeRackCpu','computeRackGpu','computeRackStorage'])assert.ok(build.catalog[tool]);
});

test('player can install all nine models at the catalog price with proper thermal and power identity',()=>{
  const {world,build}=sandbox();
  const tools={cpu:'computeRackCpu',gpu:'computeRackGpu',storage:'computeRackStorage'};let index=0;
  for(const specialization of ['cpu','gpu','storage'])for(const modelId of ['basic','professional','enterprise']){
    if(modelId!=='basic')build.cycleComputeRackModel(tools[specialization]);
    const model=COMPUTE_RACK_MODELS[specialization][modelId];
    assert.equal(build.computeRackModel(tools[specialization]),model);
    build.select(tools[specialization]);const x=2+(index%6)*2,y=2+Math.floor(index/6)*3,before=build.budget;
    const result=build.place(x,y);assert.equal(result.ok,true);assert.equal(result.entity.type,'computeRack');
    assert.equal(result.entity.specialization,specialization);assert.equal(result.entity.modelId,modelId);
    assert.deepEqual(result.entity.capacity,model.capacity);assert.equal(result.entity.currentPowerW,model.idlePowerW);assert.equal(result.entity.maxPowerW,model.maxPowerW);
    assert.equal(result.entity.heatGenerationPower,0);assert.equal(result.entity.isHeatMachine,true);
    assert.equal(world.powerEquipmentSetByType('computeRack').has(result.entity),true);assert.equal(world.heatMachines.has(result.entity),true);
    assert.equal(build.budget,before-model.cost);index++;
  }
  assert.equal(world.entitiesByType('computeRack').length,9);
});

test('compute racks stay in the server hall, rotate directional air faces and cannot be placed over an obstruction',()=>{
  const {world,build}=sandbox();build.select('computeRackCpu');
  assert.equal(build.canPlace('computeRackCpu',0,0),false);assert.equal(build.canPlace('computeRackCpu',2,2),true);
  const rack=build.place(2,2).entity;assert.deepEqual(rack.airIntakeDirection,{x:0,y:-1});assert.deepEqual(rack.airExhaustDirection,{x:0,y:1});
  world.setMaterial(4,4,'concrete');assert.equal(build.canPlace('computeRackGpu',4,4),false);
  build.rotate();assert.deepEqual(build.direction(),{x:1,y:0});
});

test('rack load scales from idle to model maximum and rejoins the directed rack heat-exchange path',()=>{
  const world=new World(8,8),rack=world.addEntity(new ComputeRack(3,3,{specialization:'gpu',modelId:'enterprise'}));
  assert.equal(rack.setUtilization(0),6000);assert.equal(rack.requestedPower,6000);
  assert.equal(rack.setUtilization(.5),21000);assert.equal(rack.heatOutput,21000);
  rack.temperature=40;world.setTemperature(3,2,25);world.setTemperature(3,4,25);
  new ThermalSystem(world,metrics()).exchangeMachines(1);
  assert.ok(world.temperatureAt(3,4)>25);assert.ok(world.temperatureAt(3,2)===25);assert.ok(rack.temperature<40);
});

test('compute racks remain serializable with a stable asset id and are inspectable and renderable by specialization',()=>{
  const {world,build}=sandbox();build.select('computeRackGpu');build.cycleComputeRackModel();const rack=build.place(5,5).entity,assetId=rack.assetId;
  const save=new DataCenterSaveSystem({storage:null,key:'compute-rack-p1'}),snapshot=save.capture(world,{},build),restoredWorld=new World(20,20);
  assert.equal(save.restoreWorld(restoredWorld,snapshot),true);
  const restored=restoredWorld.entitiesByType('computeRack')[0];assert.equal(restored.assetId,assetId);assert.equal(restored.specialization,'gpu');assert.equal(restored.modelId,'professional');
  assert.equal(spriteIdFor(restored),'computeRackGpu');assert.deepEqual(validateSpriteManifest(),[]);
  const inspectorRoot={innerHTML:'',querySelector:()=>null},inspector=new Inspector(inspectorRoot);inspector.setTarget({kind:'entity',entity:restored});inspector.update(restoredWorld);
  assert.match(inspectorRoot.innerHTML,/Rack de computação em nuvem/);assert.match(inspectorRoot.innerHTML,/4 GPUs · 48 GB\/GPU/);assert.match(inspectorRoot.innerHTML,/Potência em repouso/);
  const definition=createLevelEntity({type:'computeRack',x:8,y:8,...restored});assert.equal(definition.modelId,'professional');
});

test('capacity system separates installed, reserved, available and instantaneous compute resources',()=>{
  const world=new World(12,12),cpu=world.addEntity(new ComputeRack(1,1,{specialization:'cpu',modelId:'enterprise'}));
  const gpu=world.addEntity(new ComputeRack(3,1,{specialization:'gpu',modelId:'enterprise'}));
  const storage=world.addEntity(new ComputeRack(5,1,{specialization:'storage',modelId:'enterprise'}));
  const contracts=[{id:'a',modality:'compute',status:'active',allocations:[
    {assetId:cpu.assetId,vcpu:48,ramGB:192,gpuDevices:[],storageTB:0},
    {assetId:gpu.assetId,vcpu:0,ramGB:0,gpuDevices:[{slot:0,vramGB:80}],storageTB:0},
    {assetId:storage.assetId,vcpu:0,ramGB:0,gpuDevices:[],storageTB:80},
  ]}];
  cpu.setUtilization(.5);gpu.setUtilization(.25);storage.setUtilization(.1);
  const capacity=new ComputeCapacitySystem(world,contracts),summary=capacity.snapshot();
  assert.equal(summary.cpu.total,256);assert.equal(summary.cpu.reserved,48);assert.equal(summary.cpu.available,208);assert.equal(summary.cpu.utilized,128);
  assert.equal(summary.ram.total,1024);assert.equal(summary.ram.reserved,192);assert.equal(summary.ram.available,832);assert.equal(summary.ram.utilized,512);
  assert.equal(summary.gpu.total,8);assert.equal(summary.gpu.reserved,1);assert.equal(summary.gpu.available,7);assert.equal(summary.gpu.devices.filter(device=>device.vramGB===80).length,8);
  assert.equal(summary.gpu.devices.find(device=>device.slot===0&&device.assetId===gpu.assetId).reserved,true);
  assert.equal(summary.storage.total,500);assert.equal(summary.storage.reserved,80);assert.equal(summary.storage.available,420);assert.equal(summary.storage.utilized,50);
  cpu.setUtilization(.25);assert.equal(capacity.snapshot().cpu.utilized,64,'instantaneous use updates without changing reservations');
});

test('compute contracts share compatible racks through a complete allocation plan and commit atomically',()=>{
  const world=new World(12,12),cpu=world.addEntity(new ComputeRack(1,1,{specialization:'cpu',modelId:'enterprise'}));
  const gpu=world.addEntity(new ComputeRack(3,1,{specialization:'gpu',modelId:'enterprise'}));
  const storage=world.addEntity(new ComputeRack(5,1,{specialization:'storage',modelId:'enterprise'}));
  const contracts=[],capacity=new ComputeCapacitySystem(world,contracts),allocation=new ComputeAllocationSystem(capacity);
  const requestA={vcpu:48,ramGB:192,gpuCount:2,gpuMinVramGB:80,storageTB:80};
  const contractA={id:'cloud-a',clientName:'AI Forge',status:'active'};contracts.push(contractA);const first=allocation.commit(contractA,requestA);
  assert.equal(first.ok,true);assert.equal(contractA.allocations.length,3);
  const requestB={vcpu:64,ramGB:256,gpuCount:2,gpuMinVramGB:80,storageTB:100};
  const contractB={id:'cloud-b',clientName:'Render Lab',status:'active'};contracts.push(contractB);const second=allocation.commit(contractB,requestB);
  assert.equal(second.ok,true);assert.equal(capacity.snapshot().cpu.reserved,112);assert.equal(capacity.snapshot().ram.reserved,448);
  assert.equal(capacity.snapshot().gpu.reserved,4);assert.equal(capacity.snapshot().storage.reserved,180);
  assert.equal(allocation.commit(contractB,requestB).alreadyAllocated,true);assert.equal(capacity.snapshot().gpu.reserved,4);
  assert.equal(cpu.assetId,contractA.allocations.find(item=>item.vcpu).assetId);
  assert.equal(gpu.assetId,contractA.allocations.find(item=>item.gpuDevices.length).assetId);
  assert.equal(storage.assetId,contractA.allocations.find(item=>item.storageTB).assetId);
});

test('incompatible GPU VRAM or any other missing resource rejects the whole plan without partial reservations',()=>{
  const world=new World(12,12);world.addEntity(new ComputeRack(1,1,{specialization:'cpu',modelId:'enterprise'}));
  const incompatible=world.addEntity(new ComputeRack(3,1,{specialization:'gpu',modelId:'professional'}));world.addEntity(new ComputeRack(5,1,{specialization:'storage',modelId:'enterprise'}));
  const contracts=[],capacity=new ComputeCapacitySystem(world,contracts),allocation=new ComputeAllocationSystem(capacity),before=capacity.snapshot();
  const plan=allocation.plan({vcpu:48,ramGB:192,gpuCount:2,gpuMinVramGB:80,storageTB:80});
  assert.equal(plan.ok,false);assert.equal(plan.missing.find(item=>item.resource==='GPU').available,0);
  const contract={id:'cloud-fail',status:'active'};contracts.push(contract);assert.equal(allocation.commit(contract,{vcpu:48,ramGB:192,gpuCount:2,gpuMinVramGB:80,storageTB:80}).ok,false);
  assert.equal(contract.allocations,undefined);assert.equal(capacity.snapshot().cpu.reserved,before.cpu.reserved);assert.equal(incompatible.capacity.vramPerGpuGB,48);
});

test('cancelled compute contracts release allocations once while preserving physical racks',()=>{
  const world=new World(8,8),rack=world.addEntity(new ComputeRack(2,2,{specialization:'cpu',modelId:'basic'}));
  const contracts=[],capacity=new ComputeCapacitySystem(world,contracts),allocation=new ComputeAllocationSystem(capacity);
  const contract={id:'cloud-cancel',clientName:'CPU Client',status:'active'};contracts.push(contract);
  assert.equal(allocation.commit(contract,{vcpu:32,ramGB:128}).ok,true);assert.equal(allocation.canRemoveRack(rack.assetId),false);
  assert.equal(allocation.release(contract),true);assert.equal(allocation.release(contract),false);assert.equal(contract.allocations.length,0);
  assert.equal(capacity.snapshot().cpu.available,64);assert.equal(allocation.canRemoveRack(rack.assetId),true);assert.ok(world.entities.includes(rack));
});

test('compute workload is deterministic, changes electrical draw and heat, and idle racks retain idle demand',()=>{
  const world=new World(10,10),rack=world.addEntity(new ComputeRack(4,4,{specialization:'cpu',modelId:'basic'}));
  const contracts=[{id:'cloud-101',modality:'compute',status:'active',loadProfile:'constant',allocations:[{assetId:rack.assetId,vcpu:32,ramGB:128,gpuDevices:[],storageTB:0}]}];
  const load=new ComputeLoadSystem(world,contracts);load.update({hour:12,day:1});const first=rack.utilization,power=rack.requestedPower;
  assert.ok(first>0);assert.ok(power>rack.idlePowerW&&power<rack.maxPowerW);
  load.update({hour:12,day:1});assert.equal(rack.utilization,first);assert.equal(rack.requestedPower,power);
  rack.setUtilization(0);rack.started=true;const before=rack.energy;new ThermalSystem(world,metrics()).applyHeatSources(1,1);assert.ok(rack.energy>before);
  rack.enabled=false;load.update({hour:12,day:1});assert.equal(rack.requestedPower,0);assert.equal(rack.heatOutput,0);
});

test('shared Cloud contract SLA counts each interval once and retains reservations through a power outage',()=>{
  const world=new World(10,10),cpu=world.addEntity(new ComputeRack(2,2,{specialization:'cpu',modelId:'basic'})),gpu=world.addEntity(new ComputeRack(4,2,{specialization:'gpu',modelId:'basic'}));
  const contract={id:'cloud-sla',modality:'compute',status:'active',maxInletTemperature:24,availability:99,allocations:[{assetId:cpu.assetId,vcpu:16,ramGB:64},{assetId:gpu.assetId,gpuDevices:[{slot:0,vramGB:24}]}]};
  const sla=new ComputeSlaSystem(world);gpu.powerBlocked=true;sla.afterThermalStep([contract],720,2);
  assert.equal(contract.dailyActiveSeconds,720);assert.equal(contract.dailyDowntimeSeconds,720);assert.equal(contract.computeThermalViolationSeconds,2);assert.equal(contract.dailyViolation,true);
  const capacity=new ComputeCapacitySystem(world,[contract]);assert.equal(capacity.snapshot().cpu.reserved,16);assert.equal(capacity.snapshot().gpu.reserved,1);
  assert.equal(contract.computeDiagnostics.length,0,'both allocated racks remain present despite the outage');
});

test('financial preview estimates incremental energy and margin for a planned Cloud allocation',()=>{
  const world=new World(8,8),rack=world.addEntity(new ComputeRack(3,3,{specialization:'cpu',modelId:'enterprise'}));
  const plan={ok:true,allocations:[{assetId:rack.assetId,vcpu:64,ramGB:256}]};
  const preview=computeFinancialPreview({world,monthlyFee:50000,loadProfile:'business'},plan,{energyTariff:.55,coolingReserveKW:10});
  assert.equal(preview.estimated,true);assert.ok(preview.incrementalPowerKW>0);assert.ok(preview.monthlyEnergyCost>0);
  assert.equal(preview.estimatedMargin,50000-preview.monthlyEnergyCost);assert.equal(preview.thermalRiskKW,0);
});
