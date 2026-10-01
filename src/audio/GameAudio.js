import { isPowered } from '../simulation/PowerState.js';

const STORAGE_KEY='thermal-game-audio-enabled';
const readPreference=storage=>{try{return storage?.getItem(STORAGE_KEY)!=='false';}catch{return true;}};
const writePreference=(storage,value)=>{try{storage?.setItem(STORAGE_KEY,String(value));}catch{}}

export class GameAudio {
  constructor({storage=null,contextFactory=null}={}){
    if(!storage){try{storage=globalThis.localStorage;}catch{storage=null;}}
    this.storage=storage;this.contextFactory=contextFactory;this.enabled=readPreference(storage);this.context=null;this.master=null;this.ambient=null;this.fanGain=null;this.compressorGain=null;this.noiseSource=null;this.unlocked=false;this.victoryPlayed=false;
  }

  unlock(){
    if(!this.enabled)return false;
    if(!this.context){
      const Factory=this.contextFactory||globalThis.AudioContext||globalThis.webkitAudioContext;if(!Factory)return false;
      try{this.context=typeof Factory==='function'&&Factory.prototype?.createGain?new Factory():Factory();}catch{return false;}
      const context=this.context;this.master=context.createGain();this.master.gain.value=0;this.master.connect(context.destination);
      this.ambient=context.createGain();this.ambient.gain.value=0;this.ambient.connect(this.master);
      this.fanGain=context.createGain();this.fanGain.gain.value=0;this.fanGain.connect(this.ambient);
      this.compressorGain=context.createGain();this.compressorGain.gain.value=0;this.compressorGain.connect(this.ambient);
      const buffer=context.createBuffer(1,Math.max(1,context.sampleRate),context.sampleRate),data=buffer.getChannelData(0);
      let low=0;for(let i=0;i<data.length;i++){low=low*.97+(Math.random()*2-1)*.03;data[i]=low*3;}
      this.noiseSource=context.createBufferSource();this.noiseSource.buffer=buffer;this.noiseSource.loop=true;
      const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=520;this.noiseSource.connect(filter);filter.connect(this.fanGain);this.noiseSource.start();
      this.fanOsc=context.createOscillator();this.fanOsc.type='triangle';this.fanOsc.frequency.value=58;this.fanOsc.connect(this.fanGain);this.fanOsc.start();
      this.compressorOsc=context.createOscillator();this.compressorOsc.type='sine';this.compressorOsc.frequency.value=73;this.compressorOsc.connect(this.compressorGain);this.compressorOsc.start();
      this.unlocked=true;
    }
    try{this.context.resume?.();}catch{}
    return true;
  }

  setEnabled(enabled){
    this.enabled=Boolean(enabled);writePreference(this.storage,this.enabled);
    if(this.enabled)this.unlock();
    else if(this.master)this.ramp(this.master.gain,0,.08);
    return this.enabled;
  }
  toggle(){return this.setEnabled(!this.enabled);}

  ramp(param,value,time=.18){if(!param||!this.context)return;const now=this.context.currentTime||0;try{param.cancelScheduledValues(now);param.setTargetAtTime(value,now,time);}catch{param.value=value;}}

  update(simulation){
    if(!this.enabled||!this.context||!this.unlocked)return;
    if(simulation.mission.state==='won'&&!this.victoryPlayed){this.victoryPlayed=true;this.playVictory();}
    const running=!simulation.paused&&simulation.mission.state==='running';
    this.ramp(this.master.gain,running?.72:0,.3);
    if(!running){this.ramp(this.ambient.gain,0,.3);return;}
    const sources=[...simulation.world.entitiesByType('fan'),...simulation.world.entitiesByType('exhaust'),...simulation.world.entitiesByType('coolingUnit'),...simulation.world.entitiesByType('industrialCoolingUnit')];
    let fanLoad=0,compressorLoad=0;
    for(const item of sources){if(!isPowered(item)||item.status==='OFF'||item.status==='BLOCKED')continue;const maximum=Math.max(1,item.maxPowerW||item.power||item.ratedPower||1000),actual=Math.max(0,item.powerDraw??item.power??item.ratedPower??maximum),ratio=Math.min(1.4,actual/maximum);if(item.type==='coolingUnit'||item.type==='industrialCoolingUnit')compressorLoad+=ratio;else fanLoad+=ratio;}
    const max=Math.max(1,sources.length);fanLoad=Math.min(1,fanLoad/max*2.2);compressorLoad=Math.min(1,compressorLoad/max*2.2);
    this.ramp(this.ambient.gain,(fanLoad||compressorLoad)?1:0,.35);
    this.ramp(this.fanGain.gain,.22*fanLoad,.4);this.ramp(this.compressorGain.gain,.08*compressorLoad,.4);
  }

  tone(frequency,duration,{type='sine',volume=.12,delay=0}={}){
    if(!this.enabled||!this.unlocked||!this.context||!this.master)return;
    const c=this.context,now=(c.currentTime||0)+delay,osc=c.createOscillator(),gain=c.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,now);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(gain);gain.connect(this.master);osc.start(now);osc.stop(now+duration+.025);
  }
  playBuild(){this.tone(740,.045,{type:'square',volume:.045});this.tone(1120,.035,{volume:.025,delay:.025});}
  playCritical(){this.tone(880,.14,{type:'square',volume:.075});this.tone(660,.16,{type:'square',volume:.07,delay:.19});}
  playVictory(){this.tone(523.25,.22,{volume:.075});this.tone(659.25,.24,{volume:.075,delay:.13});this.tone(783.99,.36,{volume:.085,delay:.28});}
  dispose(){try{this.noiseSource?.stop?.();this.context?.close?.();}catch{}this.context=null;this.unlocked=false;}
}

export {STORAGE_KEY as GAME_AUDIO_STORAGE_KEY};
