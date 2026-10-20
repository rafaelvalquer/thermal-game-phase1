import test from 'node:test';
import assert from 'node:assert/strict';
import { LevelManager } from '../../src/campaign/LevelManager.js';
import { level01 } from '../../src/campaign/levels/level01.js';
import { Simulation } from '../../src/simulation/Simulation.js';
import { BuildSystem } from '../../src/building/BuildSystem.js';
import { evaluateTutorialCheck } from '../../src/ui/TutorialOverlay.js';

// Follows the Hot Room tutorial literally, through the same build rules a player uses.
test('the Hot Room tutorial solution wins within the power limit',()=>{
  const world=new LevelManager().load(level01),sim=new Simulation(world,level01,{planning:true});sim.initialize();
  const build=new BuildSystem(world,sim,{budget:level01.budget,inventory:level01.inventory}),renderer={mode:'normal'},game={world,sim,build,level:level01,renderer};
  const place=(tool,x,y,rotation=0)=>{build.select(tool);build.rotation=rotation;const result=build.place(x,y);assert.ok(result.ok,tool+' '+x+','+y+': '+result.reason);};
  build.select('coolingUnit');
  place('coolingUnit',3,19);
  build.select('duct');assert.equal(build.placeDuctPath(Array.from({length:10},(_,i)=>({x:4+i,y:19}))).failed,0);
  place('supplyVent',14,19);
  for(const x of [18,30,42])place('fan',x,18);
  for(const y of [17,19])place('exhaust',54,y);
  sim.startOperation();renderer.mode='thermal';
  for(const step of level01.tutorial.steps.slice(1))assert.ok(evaluateTutorialCheck(game,step),'tutorial step '+step.id);
  let hottest=0;
  for(let step=0;step<320*20&&sim.mission.state==='running';step++){
    sim.update(.05);
    for(const entity of world.entities)if(entity.isHeatMachine)hottest=Math.max(hottest,entity.temperature);
  }
  assert.equal(sim.mission.state,'won');
  assert.ok(hottest<38.5,'hottest machine '+hottest.toFixed(2)+' °C');
  assert.ok(sim.metrics.maxPowerEver<=level01.powerLimit);
});
