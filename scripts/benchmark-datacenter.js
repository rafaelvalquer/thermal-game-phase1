import { World } from '../src/world/World.js';
import { CoolingUnit } from '../src/entities/CoolingUnit.js';
import { SupplyVent } from '../src/entities/SupplyVent.js';
import { ServerRack } from '../src/entities/ServerRack.js';
import { AirDuct } from '../src/entities/AirDuct.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { PerformanceMonitor } from '../src/performance/PerformanceMonitor.js';

const requestedTicks=Number(process.argv.find(value=>value.startsWith('--ticks='))?.slice(8))||2000;
const scenarios=[
  {name:'A',racks:20,units:2,ducts:40},
  {name:'B',racks:100,units:10,ducts:150},
  {name:'C',racks:200,units:20,ducts:300},
];

function createScenario(scenario){
  const world=new World(120,80),rows=Math.floor(scenario.ducts/scenario.units),extra=scenario.ducts%scenario.units;
  for(let index=0;index<scenario.units;index++){
    const y=2+index*3,ductCount=rows+(index<extra?1:0);
    world.addEntity(new CoolingUnit(0,y,{direction:{x:1,y:0}}));
    for(let offset=0;offset<ductCount;offset++)world.addUtility(new AirDuct(offset+1,y,{size:'duct'}));
    world.addEntity(new SupplyVent(ductCount+1,y,{direction:{x:1,y:0}}));
  }
  const columns=Math.min(20,Math.max(1,Math.ceil(Math.sqrt(scenario.racks*2))));
  for(let index=0;index<scenario.racks;index++)world.addEntity(new ServerRack(30+index%columns,3+Math.floor(index/columns),{startAt:0,maxPowerKW:12,currentPowerKW:8,temperature:31}));
  const level={id:'datacenter-performance-benchmark',map:{width:world.width,height:world.height},thermalSystems:{simpleCooling:true,waterCooling:false},missionDuration:Infinity,objectives:[],failures:[],events:[],powerLimit:1e9};
  const monitor=new PerformanceMonitor(),simulation=new Simulation(world,level,{monitor});simulation.initialize();
  let coolingRebuilds=0,pressureSolves=0;
  const builder=simulation.cooling.builder.build.bind(simulation.cooling.builder),solve=simulation.airflow.pressure.solve.bind(simulation.airflow.pressure);
  simulation.cooling.builder.build=()=>{coolingRebuilds++;return builder();};
  simulation.airflow.pressure.solve=dt=>{pressureSolves++;return solve(dt);};
  return {world,simulation,monitor,coolingRebuilds:()=>coolingRebuilds,pressureSolves:()=>pressureSolves};
}

for(const scenario of scenarios){
  const run=createScenario(scenario),start=performance.now();
  for(let tick=0;tick<requestedTicks;tick++){run.simulation.update(1/20);run.monitor.endFrame();}
  const totalMs=performance.now()-start;
  const profile=run.monitor.snapshot();
  process.stdout.write(JSON.stringify({scenario:scenario.name,racks:scenario.racks,coolingUnits:scenario.units,ducts:scenario.ducts,ticks:requestedTicks,totalMs:Number(totalMs.toFixed(2)),averageMsPerTick:Number((totalMs/requestedTicks).toFixed(3)),coolingRebuilds:run.coolingRebuilds(),pressureSolves:run.pressureSolves(),profile:Object.fromEntries(['simulationMs','airflowMs','pressureMs','coolingMs','thermalMs','rackMs','fluidMs'].map(key=>[key,Number(profile[key].toFixed(3))]))})+'\n');
}
