import { World } from '../src/world/World.js';
import { CoolingUnit } from '../src/entities/CoolingUnit.js';
import { SupplyVent } from '../src/entities/SupplyVent.js';
import { ServerRack } from '../src/entities/ServerRack.js';
import { AirDuct } from '../src/entities/AirDuct.js';
import { Technician } from '../src/entities/Technician.js';
import { PowerBattery } from '../src/entities/PowerBattery.js';
import { SolarPanel } from '../src/entities/SolarPanel.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { PerformanceMonitor } from '../src/performance/PerformanceMonitor.js';

const requestedTicks=Number(process.argv.find(value=>value.startsWith('--ticks='))?.slice(8))||2000;
const scenarios=[
  {name:'A',racks:20,units:2,vents:8,ducts:40,technicians:1,batteries:0,panels:0},
  {name:'B',racks:100,units:10,vents:30,ducts:150,technicians:10,batteries:0,panels:0},
  {name:'C',racks:200,units:20,vents:60,ducts:300,technicians:25,batteries:0,panels:0},
  {name:'D',racks:300,units:30,vents:100,ducts:500,technicians:40,batteries:20,panels:30},
];

function createScenario(scenario){
  const world=new World(120,Math.max(80,2+(scenario.units-1)*3+3)),rows=Math.floor(scenario.ducts/scenario.units),extra=scenario.ducts%scenario.units;
  const ventRows=Math.floor(scenario.vents/scenario.units),ventExtra=scenario.vents%scenario.units;
  for(let index=0;index<scenario.units;index++){
    const y=2+index*3,ductCount=rows+(index<extra?1:0),ventCount=ventRows+(index<ventExtra?1:0);
    world.addEntity(new CoolingUnit(0,y,{direction:{x:1,y:0}}));
    for(let offset=0;offset<ductCount;offset++)world.addUtility(new AirDuct(offset+1,y,{size:'duct'}));
    for(let offset=0;offset<ventCount;offset++)world.addEntity(new SupplyVent(ductCount+1+offset,y,{direction:{x:1,y:0}}));
  }
  const columns=Math.min(20,Math.max(1,Math.ceil(Math.sqrt(scenario.racks*2))));
  for(let index=0;index<scenario.racks;index++)world.addEntity(new ServerRack(30+index%columns,3+Math.floor(index/columns),{startAt:0,maxPowerKW:12,currentPowerKW:8,temperature:31}));
  for(let index=0;index<scenario.technicians;index++)world.addEntity(new Technician(2+index%20,65-Math.floor(index/20)*2));
  for(let index=0;index<scenario.batteries;index++)world.addEntity(new PowerBattery(3+index%20,70-Math.floor(index/20)*2));
  for(let index=0;index<scenario.panels;index++)world.addEntity(new SolarPanel(30+index%20,70-Math.floor(index/20)*2));
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
  process.stdout.write(JSON.stringify({scenario:scenario.name,racks:scenario.racks,coolingUnits:scenario.units,vents:scenario.vents,ducts:scenario.ducts,technicians:scenario.technicians,batteries:scenario.batteries,solarPanels:scenario.panels,ticks:requestedTicks,totalMs:Number(totalMs.toFixed(2)),averageMsPerTick:Number((totalMs/requestedTicks).toFixed(3)),coolingRebuilds:run.coolingRebuilds(),pressureSolves:run.pressureSolves(),profile:Object.fromEntries(['simulationMs','airflowMs','pressureMs','coolingMs','thermalMs','rackMs','fluidMs'].map(key=>[key,Number(profile[key].toFixed(3))]))})+'\n');
}
