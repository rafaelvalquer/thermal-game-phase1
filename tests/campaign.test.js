import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/campaign/levels/index.js';
import { LevelManager } from '../src/campaign/LevelManager.js';
import { CampaignManager } from '../src/campaign/CampaignManager.js';
import { MissionEventSystem } from '../src/campaign/MissionEventSystem.js';
import { ObjectiveSystem } from '../src/campaign/ObjectiveSystem.js';
import { World } from '../src/world/World.js';
import { Machine } from '../src/entities/Machine.js';

class MemoryStorage {
  constructor(){this.data=new Map();}
  getItem(k){return this.data.get(k)??null;}
  setItem(k,v){this.data.set(k,String(v));}
}

const metrics=()=>({powerDraw:0,maxAirTemp:25,maxTemp:25,avgTemp:25});

test('all six levels load from data definitions',()=>{
  const manager=new LevelManager();
  assert.equal(LEVELS.length,6);
  for(const level of LEVELS){
    const world=manager.load(level);
    assert.equal(world.width,level.map.width);
    assert.equal(world.height,level.map.height);
    assert.equal(world.levelId,level.id);
    assert.ok(world.entities.length>0);
  }
});

test('campaign completion unlocks the next level and persists',()=>{
  const storage=new MemoryStorage(),campaign=new CampaignManager({storage});
  assert.equal(campaign.isUnlocked(LEVELS[0]),true);
  assert.equal(campaign.isUnlocked(LEVELS[1]),false);
  campaign.completeLevel(LEVELS[0],{cost:1000,maxPower:3000,maxTemperature:39,completionTime:310});
  assert.equal(campaign.isUnlocked(LEVELS[1]),true);
  const restored=new CampaignManager({storage});
  assert.equal(restored.isCompleted(LEVELS[0]),true);
});

test('zone temperature objective reads simulated air cells',()=>{
  const world=new World(6,6),level={zones:[{id:'z',name:'Zone',x:1,y:1,width:3,height:3}],objectives:[{type:'zoneTemperature',zoneId:'z',max:30}]};
  world.setTemperature(2,2,35);
  const system=new ObjectiveSystem(world,level,metrics()),status=system.evaluate();
  assert.equal(status[0].ok,false);
  world.setTemperature(2,2,25);
  assert.equal(system.evaluate()[0].ok,true);
});

test('mission event changes machine load at configured time',()=>{
  const world=new World(4,4),machine=new Machine(1,1,{heatOutput:1000});machine.category='serverRack';world.addEntity(machine);
  const level={events:[{time:180,type:'machineLoad',filter:{category:'serverRack'},multiplier:1.3}]};
  const events=new MissionEventSystem(world,level);
  events.update(179);assert.equal(machine.loadMultiplier,1);
  events.update(180);assert.equal(machine.loadMultiplier,1.3);
  events.update(300);assert.equal(machine.loadMultiplier,1.3);
});

test('critical facility contains locked inherited infrastructure',()=>{
  const world=new LevelManager().load(LEVELS[5]);
  const locked=world.entities.filter(e=>e.locked);
  assert.ok(locked.length>=5);
});
