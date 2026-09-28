import test from 'node:test';
import assert from 'node:assert/strict';
import { Inspector } from '../../src/ui/Inspector.js';
import { MetricsPanel } from '../../src/ui/MetricsPanel.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { Fan } from '../../src/entities/Fan.js';
import { ExhaustFan } from '../../src/entities/ExhaustFan.js';
import { Pump } from '../../src/entities/Pump.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { ServerRack } from '../../src/entities/ServerRack.js';
import { World } from '../../src/world/World.js';
import { UIManager } from '../../src/ui/UIManager.js';

test('simple cooling inspector omits technical pressure from a cold-air outlet',()=>{
  const vent=new SupplyVent(2,3),world={thermalSystems:{simpleCooling:true},entities:[vent],allUtilities:()=>[]};
  const root={innerHTML:'',querySelector:()=>null},inspector=new Inspector(root);
  inspector.setTarget({kind:'entity',entity:vent});inspector.update(world);
  assert.match(root.innerHTML,/Frio entregue/);
  assert.doesNotMatch(root.innerHTML,/Pressão|Pa/);
});

test('inspector offers a power switch for every powered device and leaves passive outlets without one',()=>{
  const world=new World(12,8),devices=[new Fan(1,1),new ExhaustFan(2,1),new Pump(3,1),new CoolingUnit(4,1),new ServerRack(5,1)];
  devices.forEach(device=>world.addEntity(device));
  for(const device of devices){
    let click=null,received=null;
    const root={innerHTML:'',querySelector(selector){return selector==='[data-power-toggle]'?{addEventListener(_type,handler){click=handler;}}:null;}};
    const inspector=new Inspector(root);inspector.onPowerToggle=entity=>received=entity;inspector.setTarget({kind:'entity',entity:device});inspector.update(world);
    assert.match(root.innerHTML,/data-power-toggle/);
    assert.match(root.innerHTML,/Desligar aparelho/);
    click();assert.equal(received,device);
  }
  const outlet=new SupplyVent(6,1);world.addEntity(outlet);
  const root={innerHTML:'',querySelector:()=>null},inspector=new Inspector(root);inspector.setTarget({kind:'entity',entity:outlet});inspector.update(world);
  assert.doesNotMatch(root.innerHTML,/data-power-toggle/);
});

test('power switch immediately updates enabled state and the displayed electrical draw',()=>{
  const world=new World(4,4),fan=new Fan(1,1);world.addEntity(fan);
  const toasts=[],sim={metrics:{powerDraw:fan.power},airflow:{fans:{updateAllDiagnostics(){fan.currentVelocity=fan.enabled?1:0;}}}},ui=Object.create(UIManager.prototype);
  ui.game={world,sim,datacenter:null,toast:message=>toasts.push(message)};ui.inspector={update(){}};
  ui.togglePower(fan);
  assert.equal(fan.enabled,false);assert.equal(sim.metrics.powerDraw,0);assert.equal(fan.currentVelocity,0);
  ui.togglePower(fan);
  assert.equal(fan.enabled,true);assert.equal(sim.metrics.powerDraw,fan.power);assert.equal(toasts.length,2);
});

test('simple cooling inspector keeps pressure and solver terms out of fans and map cells',()=>{
  const fan=new Fan(1,1,{x:1,y:0});fan.currentFlow=.7;fan.flowEfficiency=.6;
  const world=new World(4,4);world.thermalSystems={simpleCooling:true};world.addEntity(fan);
  const root={innerHTML:'',querySelector:()=>null},inspector=new Inspector(root);
  inspector.setTarget({kind:'entity',entity:fan});inspector.update(world);
  assert.match(root.innerHTML,/Vazão atual/);
  assert.doesNotMatch(root.innerHTML,/Pressão|Pa|Operating Point|Free Flow/);
  inspector.setTarget({kind:'tile',x:1,y:1});inspector.update(world);
  assert.match(root.innerHTML,/Fluxo de ar/);
  assert.doesNotMatch(root.innerHTML,/Pressão|\bPa\b|Divergência|wall proximity/i);
});

test('rack inspector explains missing cooling capacity and confirms cold airflow reaches the intake',()=>{
  const world=new World(8,8);world.thermalSystems={simpleCooling:true};
  const rack=world.addEntity(new ServerRack(3,3));rack.heatGenerationPower=6000;rack.status='HOT';
  const root={innerHTML:'',querySelector:()=>null},inspector=new Inspector(root);
  inspector.setTarget({kind:'entity',entity:rack});inspector.update(world);
  assert.match(root.innerHTML,/Instale uma condensadora/);

  const unit=world.addEntity(new CoolingUnit(1,1)),vent=world.addEntity(new SupplyVent(3,1));vent.flowRate=.5;
  world.coolingSystem={metrics:{coolingAvailableCapacity:1000},networks:[{status:'READY',paths:[{vent,flowRate:.5,unit}]}]};
  inspector.update(world);
  assert.match(root.innerHTML,/Capacidade de refrigeração abaixo/);

  world.coolingSystem.metrics.coolingAvailableCapacity=10000;
  world.airY[world.index(3,2)]=.2;
  inspector.update(world);
  assert.match(root.innerHTML,/Ar frio e vazão chegam à entrada/);
});

test('rack inspector reports temperatures and directional airflow on both faces',()=>{
  const world=new World(8,8);world.thermalSystems={simpleCooling:true};
  const rack=world.addEntity(new ServerRack(3,3));
  Object.assign(rack,{intakeAirTemperature:23.7,exhaustAirTemperature:43.2,intakeAirFlow:.42,intakeAirVelocity:.34,exhaustAirFlow:.38,exhaustAirVelocity:.30});
  const root={innerHTML:'',querySelector:()=>null},inspector=new Inspector(root);
  inspector.setTarget({kind:'entity',entity:rack});inspector.update(world);
  assert.match(root.innerHTML,/Temperatura na face fria[\s\S]*23\.7 °C/);
  assert.match(root.innerHTML,/Temperatura na face quente[\s\S]*43\.2 °C/);
  assert.match(root.innerHTML,/Vazão na entrada[\s\S]*0\.42 m³\/s/);
  assert.match(root.innerHTML,/Velocidade na entrada[\s\S]*0\.34 m\/s/);
  assert.match(root.innerHTML,/Vazão na saída[\s\S]*0\.38 m³\/s/);
  assert.match(root.innerHTML,/Sentido de insuflação[\s\S]*↑/);
  assert.match(root.innerHTML,/Sentido de retorno[\s\S]*↓/);
});

test('cooling HUD shows available capacity and counts loaded units as online',()=>{
  const root={innerHTML:''},panel=new MetricsPanel(root);
  const sim={simpleCooling:true,metrics:{maxTemp:35,maxAirTemp:35,maxMachineTemp:32,avgTemp:30,powerDraw:3600,coolingDelivered:12000,
    coolingInstalledCapacity:50000,coolingAvailableCapacity:47500,coolingActiveCapacity:12000,
    coolingReserveMargin:.75,generatedHeat:0,externalEnergy:0,energyBalance:0},
  world:{environment:{temperature:25}},
  mission:{holdSeconds:8},cooling:{units:[
    {enabled:true,status:'PARTIAL LOAD',networkStatus:'READY'},
    {enabled:true,status:'HIGH LOAD',networkStatus:'READY'},
  ]}};
  panel.update(sim,{budget:12000},{powerLimit:10000,missionDuration:300});
  assert.match(root.innerHTML,/Capacidade disponível[\s\S]*47\.50 kW/);
  assert.match(root.innerHTML,/2 \/ 2 online/);
  assert.match(root.innerHTML,/Frio entregue/);
  assert.match(root.innerHTML,/Ar máximo[\s\S]*35\.0 °C/);
  assert.match(root.innerHTML,/Máquina mais quente[\s\S]*32\.0 °C/);
  assert.doesNotMatch(root.innerHTML,/Orçamento|Consumo elétrico|Consumo<\/small>/);
  assert.doesNotMatch(root.innerHTML,/Energy balance|Cooling/);
});

function temperatureAlerts(maxAirTemp,maxMachineTemp){
  const alerts={innerHTML:''},previousDocument=globalThis.document;
  globalThis.document={querySelector:selector=>selector==='#alerts'?alerts:null};
  try{
    const ui=Object.create(UIManager.prototype);
    ui.game={level:{powerLimit:10000},sim:{metrics:{maxAirTemp,maxMachineTemp,maxTemp:Math.max(maxAirTemp,maxMachineTemp),powerDraw:0},world:{airDiagnostics:{}},mission:{},fluid:null,cooling:null}};
    ui.updateAlerts();
    return alerts.innerHTML;
  }finally{globalThis.document=previousDocument;}
}

test('thermal alerts identify hot air separately from an overheated machine',()=>{
  const hotAir=temperatureAlerts(65,25);
  assert.match(hotAir,/AR QUENTE/);
  assert.doesNotMatch(hotAir,/MÁQUINA SUPERAQUECIDA/);

  const hotMachine=temperatureAlerts(25,82);
  assert.match(hotMachine,/MÁQUINA SUPERAQUECIDA/);
  assert.doesNotMatch(hotMachine,/AR QUENTE|AR CRÍTICO/);

  const both=temperatureAlerts(82,82);
  assert.match(both,/AR CRÍTICO/);
  assert.match(both,/MÁQUINA SUPERAQUECIDA/);
});

test('machines between warning and critical thresholds keep a source-specific warning',()=>{
  const alerts=temperatureAlerts(25,65);
  assert.match(alerts,/MÁQUINA QUENTE/);
  assert.doesNotMatch(alerts,/AR QUENTE/);
});
