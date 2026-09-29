import test from 'node:test';
import assert from 'node:assert/strict';
import { UIManager } from '../../src/ui/UIManager.js';
import { PowerBattery } from '../../src/entities/PowerBattery.js';

test('power chart shows stored battery energy and highlights discharge while it is used',()=>{
  const strokes=[],labels=[];
  const ctx={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes.push(this.strokeStyle);},setLineDash(){},closePath(){},fill(){},fillText(text){labels.push(text);}};
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:220,height:38})};
  const battery=new PowerBattery(1,1,{storedEnergyJ:40*3_600_000});battery.dischargePowerW=10000;battery.operationState='DISCHARGING';
  const summary={textContent:'',title:''},previousDocument=globalThis.document,previousRatio=globalThis.devicePixelRatio;
  globalThis.document={querySelector:selector=>selector==='#powerSummary'?summary:null};globalThis.devicePixelRatio=1;
  try{
    const ui=Object.create(UIManager.prototype);ui.powerGraph=canvas;ui.powerGraphCtx=ctx;
    ui.game={level:{powerLimit:100000},world:{entitiesByType:()=>[battery]},sim:{metrics:{powerDraw:95000},history:[
      {power:100000,solarGenerationW:4200,batteryStoredKWh:42,batteryCapacityKWh:50,batteryDischargeW:0},
      {power:95000,solarGenerationW:4000,batteryStoredKWh:40,batteryCapacityKWh:50,batteryDischargeW:10000},
    ]}};
    ui.game.sim.metrics.solarGenerationW=4200;ui.drawPowerGraph();
    assert.match(summary.textContent,/Bat 40\.0\/50 kWh/);assert.match(summary.textContent,/USANDO 10\.00 kW/);
    assert.match(summary.textContent,/Solar 4\.20 kW/);assert.ok(strokes.includes('#fbbf24'),'solar generation has its own yellow power series');
    assert.match(summary.title,/Energia armazenada: 40\.00 de 50\.00 kWh/);
    assert.ok(strokes.includes('#fb923c'),'battery discharge has its own orange power series');
    assert.ok(strokes.includes('#a78bfa'),'stored energy has its own purple availability series');
    assert.ok(labels.includes('50 kWh'),'stored-energy curve is labeled in kWh');
  }finally{
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
    if(previousRatio===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previousRatio;
  }
});
