import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio } from '../../src/audio/GameAudio.js';
import { UIManager } from '../../src/ui/UIManager.js';

class FakeParam {
  constructor(){this.value=0;this.calls=[];}
  cancelScheduledValues(){}
  setTargetAtTime(value){this.value=value;this.calls.push(value);}
  setValueAtTime(value){this.value=value;}
  exponentialRampToValueAtTime(value){this.value=value;}
}
class FakeNode {
  constructor(){this.gain=new FakeParam();this.frequency=new FakeParam();this.connections=[];this.type='';this.started=0;this.stopped=0;}
  connect(node){this.connections.push(node);return node;}
  start(){this.started++;}
  stop(){this.stopped++;}
}
class FakeAudioContext {
  constructor(){this.sampleRate=16;this.currentTime=1;this.destination=new FakeNode();this.nodes=[];this.state='suspended';}
  createGain(){const node=new FakeNode();this.nodes.push(node);return node;}
  createBufferSource(){const node=new FakeNode();this.nodes.push(node);return node;}
  createBiquadFilter(){const node=new FakeNode();this.nodes.push(node);return node;}
  createOscillator(){const node=new FakeNode();node.isOscillator=true;this.nodes.push(node);return node;}
  createBuffer(_channels,length){const data=new Float32Array(length);return {getChannelData:()=>data};}
  resume(){this.state='running';}
  close(){this.state='closed';}
}

test('audio defaults on, waits for a user gesture, and persists mute preference',()=>{
  const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const audio=new GameAudio({storage,contextFactory:FakeAudioContext});
  assert.equal(audio.enabled,true);assert.equal(audio.context,null);
  audio.toggle();assert.equal(data.get('thermal-game-audio-enabled'),'false');assert.equal(audio.context,null);
  audio.toggle();assert.equal(data.get('thermal-game-audio-enabled'),'true');assert.ok(audio.context);assert.equal(audio.context.state,'running');
  audio.dispose();
});

test('ambient layers follow powered devices and fade while paused or after mission end',()=>{
  const audio=new GameAudio({storage:{getItem:()=>null,setItem(){}},contextFactory:FakeAudioContext});audio.unlock();
  const fan={type:'fan',enabled:true,power:400},unit={type:'coolingUnit',enabled:true,power:2000};
  const simulation={paused:false,mission:{state:'running'},world:{entitiesByType:type=>type==='fan'?[fan]:type==='coolingUnit'?[unit]:[]}};
  audio.update(simulation);assert.equal(audio.fanGain.gain.value>0,true);assert.equal(audio.compressorGain.gain.value>0,true);
  simulation.paused=true;audio.update(simulation);assert.equal(audio.ambient.gain.value,0);
  simulation.paused=false;simulation.mission.state='failed';audio.update(simulation);assert.equal(audio.master.gain.value,0);
  audio.dispose();
});

test('build, critical, and victory cues are synthesized and victory plays only once',()=>{
  const audio=new GameAudio({storage:{getItem:()=>null,setItem(){}},contextFactory:FakeAudioContext});audio.unlock();
  const baseline=audio.context.nodes.filter(node=>node.isOscillator).length;audio.playBuild();audio.playCritical();let oscillators=audio.context.nodes.filter(node=>node.isOscillator).length;
  assert.equal(oscillators-baseline,4);
  const simulation={paused:false,mission:{state:'won'},world:{entitiesByType:()=>[]}};
  audio.update(simulation);const afterVictory=audio.context.nodes.filter(node=>node.isOscillator).length;assert.equal(afterVictory,baseline+7);
  audio.update(simulation);assert.equal(audio.context.nodes.filter(node=>node.isOscillator).length,afterVictory);
  audio.dispose();
});

test('critical alarm is edge-triggered and may repeat after recovery',()=>{
  let alarms=0;const state={game:{audio:{enabled:true,unlocked:true,playCritical(){alarms++;}},sim:{metrics:{maxAirTemp:81,maxMachineTemp:30}}},criticalAudioActive:false};
  UIManager.prototype.updateCriticalAudio.call(state);UIManager.prototype.updateCriticalAudio.call(state);assert.equal(alarms,1);
  state.game.sim.metrics.maxAirTemp=40;UIManager.prototype.updateCriticalAudio.call(state);
  state.game.sim.metrics.maxMachineTemp=82;UIManager.prototype.updateCriticalAudio.call(state);assert.equal(alarms,2);
});

test('critical machine alert includes a manual focus action while air-only alerts do not',()=>{
  const previous=globalThis.document,root={innerHTML:''},machine={id:23,type:'serverRack',temperature:84};
  globalThis.document={querySelector:selector=>selector==='#alerts'?root:null};
  try{
    const state={game:{sim:{metrics:{maxAirTemp:25,maxMachineTemp:84,powerDraw:0},world:{heatMachines:new Set([machine]),airDiagnostics:{}},mission:{lastEventMessage:'',},fluid:{networks:[]},cooling:{units:[]}},level:{powerLimit:1e6}}};
    UIManager.prototype.updateAlerts.call(state);assert.match(root.innerHTML,/data-focus-thermal="23"/);
    state.game.sim.metrics.maxMachineTemp=0;state.game.sim.metrics.maxAirTemp=82;UIManager.prototype.updateAlerts.call(state);assert.doesNotMatch(root.innerHTML,/data-focus-thermal/);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
