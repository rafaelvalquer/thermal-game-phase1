import test from 'node:test';
import assert from 'node:assert/strict';
import { Inspector } from '../../src/ui/Inspector.js';
import { MetricsPanel } from '../../src/ui/MetricsPanel.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { Fan } from '../../src/entities/Fan.js';
import { World } from '../../src/world/World.js';
import { UIManager } from '../../src/ui/UIManager.js';

test('simple cooling inspector omits technical pressure from a cold-air outlet',()=>{
  const vent=new SupplyVent(2,3),world={thermalSystems:{simpleCooling:true},entities:[vent],allUtilities:()=>[]};
  const root={innerHTML:'',querySelector:()=>null},inspector=new Inspector(root);
  inspector.setTarget({kind:'entity',entity:vent});inspector.update(world);
  assert.match(root.innerHTML,/Frio entregue/);
  assert.doesNotMatch(root.innerHTML,/Pressão|Pa/);
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
