import { LevelManager } from '../src/campaign/LevelManager.js';
import { level01 } from '../src/campaign/levels/level01.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { Fan } from '../src/entities/Fan.js';
import { ExhaustFan } from '../src/entities/ExhaustFan.js';
import { PlacementValidator } from '../src/building/PlacementValidator.js';
import { BUILD_CATALOG } from '../src/building/BuildCatalog.js';

export function createScenario(strategy='good') {
  const world=new LevelManager().load(level01);
  const validator=new PlacementValidator(world);let cost=0;
  const place=e=>{
    if(!validator.canPlace(e.type,e.x,e.y))throw new Error(`Invalid reference placement: ${e.type} ${e.x},${e.y}`);
    cost+=BUILD_CATALOG[e.type].cost;world.addEntity(e);
  };
  const positions=strategy==='bad'?[[12,40,0,1]]:strategy==='scattered'?[[12,40,0,1],[12,42,-1,0],[49,42,0,1],[51,42,1,0]]:[[19,18,1,0],[31,18,1,0],[43,18,1,0],[44,19,0,-1]];
  for(const [x,y,dx,dy] of positions)place(new Fan(x,y,{x:dx,y:dy}));
  if(strategy==='good')for(const y of [17,19])place(new ExhaustFan(54,y));
  if(cost>level01.budget)throw new Error('Reference strategy exceeds budget');
  for(const type of ['fan','exhaust'])if(world.entitiesByType(type).length>level01.inventory[type])throw new Error('Reference strategy exceeds inventory');
  const simulation=new Simulation(world,level01);simulation.initialize();
  return {world,simulation,cost};
}

export function runScenario(strategy='good',seconds=350) {
  const result=createScenario(strategy),{world,simulation}=result;
  let maxMachineTemp=25,consecutiveSafeSeconds=0;
  for(let step=0;step<seconds*20&&simulation.mission.state==='running';step++){
    simulation.update(.05);
    const hottest=Math.max(...world.entities.filter(e=>e.isHeatMachine).map(e=>e.temperature));
    maxMachineTemp=Math.max(maxMachineTemp,hottest);
    if(simulation.elapsed>=10)consecutiveSafeSeconds=hottest<40?consecutiveSafeSeconds+.05:0;
  }
  return {...result,maxMachineTemp,consecutiveSafeSeconds,temperatures:world.entities.filter(e=>e.isHeatMachine).map(e=>e.temperature)};
}
