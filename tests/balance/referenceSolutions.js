import { LEVELS } from '../../src/campaign/levels/index.js';
import { LevelManager } from '../../src/campaign/LevelManager.js';
import { Simulation } from '../../src/simulation/Simulation.js';
import { BuildSystem } from '../../src/building/BuildSystem.js';

// Reference builds that win each campaign mission through the same build rules a
// player uses. They guard the balance: if a physics change makes one of them lose,
// the level needs to be rebalanced or the reference updated deliberately.
const line=(x1,y1,x2,y2)=>{
  const path=[[x1,y1]],dx=Math.sign(x2-x1),dy=Math.sign(y2-y1);let x=x1,y=y1;
  while(x!==x2||y!==y2){x+=dx;y+=dy;path.push([x,y]);}
  return path;
};
const fan=(x,y,rot=0)=>({tool:'fan',x,y,rot}),exhaust=(x,y,rot=0)=>({tool:'exhaust',x,y,rot}),vent=(x,y,rot=0)=>({tool:'supplyVent',x,y,rot});
const unit=(x,y)=>({tool:'coolingUnit',x,y}),duct=path=>({tool:'duct',path});

export const REFERENCE_SOLUTIONS={
  // Hot Room: the tutorial build (compact unit, vent, fans and exhausts).
  1:{model:'compact',actions:[unit(3,19),duct(line(4,19,13,19)),vent(14,19),fan(18,18),fan(30,18),fan(42,18),exhaust(54,17),exhaust(54,19)]},
  // Ventilation Corridor: airflow only; fans push room air out of the doors, exhausts pull the corridor.
  2:{actions:[fan(16,13,1),fan(16,21,1),fan(43,13,1),fan(43,21,1),fan(20,30),fan(40,30),exhaust(58,29),exhaust(58,31)]},
  // Office Complex: one compact network for the lab and offices, one for the electrical room.
  3:{model:'compact',actions:[
    unit(50,1),duct(line(50,2,50,8)),duct([...line(51,2,56,2),...line(56,3,56,8)]),duct(line(49,2,14,2)),duct(line(14,3,14,8)),duct(line(29,3,29,8)),
    vent(50,9,1),vent(56,9,1),vent(14,9,1),vent(29,9,1),
    unit(18,54),duct(line(18,53,18,43)),vent(18,42,3),
    fan(16,37,3),fan(17,37,3),fan(49,25,1),fan(33,31,3),fan(50,28),
    exhaust(67,28),exhaust(67,29)]},
  // Server Vault: one compact network per cold side, exhausts at both ends of the hot aisle.
  4:{model:'compact',actions:[
    unit(29,1),duct([...line(29,2,29,3),...line(28,3,16,3),[16,4]]),duct([...line(30,3,42,3),[42,4]]),vent(16,5,1),vent(42,5,1),
    unit(29,58),duct([...line(29,57,29,56),...line(28,56,16,56),[16,55]]),duct([...line(30,56,42,56),[42,55]]),vent(16,54,3),vent(42,54,3),
    exhaust(4,28,2),exhaust(4,30,2),exhaust(75,28),exhaust(75,30),
    fan(57,30),fan(30,24,2),fan(30,35,2)]},
  // Thermal Factory: insulate the furnace door, cool process, motor B and the operators.
  5:{model:'compact',actions:[
    {tool:'insulation',path:line(16,28,19,28)},
    unit(65,1),duct(line(65,2,65,16)),vent(65,17,1),
    unit(50,1),duct(line(50,2,50,15)),vent(50,16,1),
    unit(18,59),duct(line(18,58,18,52)),vent(18,51,3),
    exhaust(83,30),exhaust(83,32),exhaust(83,31),exhaust(4,30,2),exhaust(4,32,2),
    fan(37,18),fan(49,18),fan(63,20)]},
};

export function buildReference(levelNumber){
  const level=LEVELS.find(item=>item.number===levelNumber),solution=REFERENCE_SOLUTIONS[levelNumber];
  const world=new LevelManager().load(level),sim=new Simulation(world,level,{planning:true});sim.initialize();
  const build=new BuildSystem(world,sim,{budget:level.budget,inventory:level.inventory}),failures=[];
  if(solution.model)build.coolingUnitModel=solution.model;
  for(const action of solution.actions){
    build.select(action.tool);build.rotation=action.rot??0;
    if(action.model)build.coolingUnitModel=action.model;
    if(action.path){const path=action.path.map(([x,y])=>({x,y})),result=action.tool==='duct'?build.placeDuctPath(path):build.placeStructurePath(path);if(result.failed)failures.push(action.tool+' path: '+result.failed+' failed');}
    else{const result=build.place(action.x,action.y);if(!result.ok)failures.push(action.tool+' '+action.x+','+action.y+': '+result.reason);}
  }
  return {level,world,sim,build,failures};
}

export function runReference(levelNumber){
  const reference=buildReference(levelNumber),{level,sim}=reference;
  sim.startOperation();
  const steps=((level.missionDuration||300)+30)*20;
  for(let step=0;step<steps&&sim.mission.state==='running';step++)sim.update(.05);
  return {...reference,result:{cost:level.budget-reference.build.budget,maxPower:sim.metrics.maxPowerEver,thermalMargin:sim.mission.minThermalMargin}};
}
