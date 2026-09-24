import test from 'node:test';
import assert from 'node:assert/strict';
import { THERMAL_STOPS, thermalColor, thermalCss, thermalLegendPosition } from '../../src/rendering/thermal/ThermalPalette.js';

test('thermal palette clamps extremes and uses the fixed stop colors',()=>{
  assert.deepEqual(thermalColor(-10),THERMAL_STOPS[0].color);
  assert.deepEqual(thermalColor(15),[15,45,150]);
  assert.deepEqual(thermalColor(25),[20,185,215]);
  assert.deepEqual(thermalColor(35),[250,125,25]);
  assert.deepEqual(thermalColor(40),[235,25,50]);
  assert.deepEqual(thermalColor(45),[215,30,65]);
  assert.deepEqual(thermalColor(55),[180,25,70]);
  assert.deepEqual(thermalColor(80),[110,20,55]);
  assert.deepEqual(thermalColor(120),THERMAL_STOPS.at(-1).color);
});

test('temperature between stops is interpolated smoothly',()=>{
  assert.deepEqual(thermalColor(37.5),[246,79,33]);
  assert.equal(thermalCss(40),'rgba(235,25,50,1)');
});

test('palette stops advance in fixed real-temperature order',()=>{
  assert.deepEqual(THERMAL_STOPS.map(stop=>stop.temp),[15,20,25,28,30,33,35,38,40,45,55,70,80]);
  assert.ok(thermalColor(39)[1]>thermalColor(45)[1]);
  assert.notDeepEqual(thermalColor(25),thermalColor(30));
  assert.notDeepEqual(thermalColor(35),thermalColor(40));
});

test('operating temperatures have visible two-degree separation and expanded legend space',()=>{
  for(const temperature of [25,27,29,31,33,35,37,39]){
    const a=thermalColor(temperature),b=thermalColor(temperature+2);
    assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))>25,temperature+' C contrast');
  }
  assert.ok(thermalLegendPosition(40)-thermalLegendPosition(25)>.59);
  assert.equal(thermalLegendPosition(-10),0);
  assert.equal(thermalLegendPosition(120),1);
  assert.ok(THERMAL_STOPS.every((s,i)=>i===0||thermalLegendPosition(s.temp)>thermalLegendPosition(THERMAL_STOPS[i-1].temp)));
});
