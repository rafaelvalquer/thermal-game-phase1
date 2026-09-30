import { LevelManager } from '../src/campaign/LevelManager.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { PerformanceMonitor } from '../src/performance/PerformanceMonitor.js';
import { relativeScalingGate } from '../src/performance/RelativeScalingGate.js';
import { FIXED_DT } from '../src/utils/Constants.js';
import { browserBenchmarkScenarios, createBrowserBenchmarkLevel } from '../src/dev/BrowserPerformanceBenchmark.js';
import { ComputeLoadSystem } from '../src/datacenter/compute/ComputeLoadSystem.js';

const argument=prefix=>process.argv.find(value=>value.startsWith(prefix))?.slice(prefix.length);
const requestedTicks=Math.max(1,Number(argument('--ticks='))||2000);
const requestedWarmup=argument('--warmup=');
const warmupTicks=Math.max(0,Number(requestedWarmup) || Math.min(500,Math.max(100,Math.ceil(requestedTicks*.15))));
const requestedScenario=argument('--scenario=')?.toUpperCase();
const requireRelativeBudget=process.argv.includes('--gate');
const scenarios=browserBenchmarkScenarios();
if(requestedScenario&&!scenarios[requestedScenario])throw new Error(`Cenário desconhecido: ${requestedScenario}`);
if(requireRelativeBudget&&requestedScenario)throw new Error('--gate compara todos os cenários; remova --scenario.');

function createScenario(name){
  const profile=scenarios[name],level=createBrowserBenchmarkLevel(name),world=new LevelManager().load(level);
  const computeRacks=world.entitiesByType('computeRack'),contracts=Array.from({length:profile.cloudContracts||0},(_,index)=>{
    const rack=computeRacks[index%computeRacks.length],allocation={assetId:rack.assetId,vcpu:0,ramGB:0,gpuDevices:[],storageTB:0};
    if(rack.specialization==='cpu'){allocation.vcpu=8;allocation.ramGB=32;}
    else if(rack.specialization==='gpu')allocation.gpuDevices=[{slot:index%rack.capacity.gpuCount,vramGB:rack.capacity.vramPerGpuGB}];
    else allocation.storageTB=10;
    return {id:'benchmark-cloud-'+index,modality:'compute',status:'active',loadProfile:['business','streaming','ai','storage'][index%4],allocations:[allocation]};
  });
  const clock={seconds:0,day:1,hour:12,daySeconds:43200};
  const computeLoad=new ComputeLoadSystem(world,contracts);
  world.datacenter={clock,update:dt=>{clock.seconds+=dt;clock.day=Math.floor(clock.seconds/86400)+1;clock.daySeconds=clock.seconds%86400;clock.hour=clock.daySeconds/3600;computeLoad.update(clock);},protectPower:(dt,billingDt)=>world.batteryDispatch.dispatch(level.powerLimit,billingDt),afterThermalStep:()=>{}};
  const monitor=new PerformanceMonitor(),simulation=new Simulation(world,level,{monitor});
  simulation.initialize();
  let coolingRebuilds=0,pressureSolves=0;
  const builder=simulation.cooling.builder.build.bind(simulation.cooling.builder),solve=simulation.airflow.pressure.solve.bind(simulation.airflow.pressure);
  simulation.cooling.builder.build=()=>{coolingRebuilds++;return builder();};
  simulation.airflow.pressure.solve=dt=>{pressureSolves++;return solve(dt);};
  return {profile,level,world,simulation,monitor,coolingRebuilds:()=>coolingRebuilds,pressureSolves:()=>pressureSolves};
}

const measured=[];
for(const name of Object.keys(scenarios).filter(key=>!requestedScenario||key===requestedScenario)){
  const run=createScenario(name);
  // Benchmark one fixed physics step per tick. Simulation.update() now owns a
  // real-frame accumulator, which would otherwise count many no-op frames here.
  const step=()=>{run.monitor.begin('simulationMs');try{run.simulation.step(FIXED_DT);}finally{run.monitor.end('simulationMs');}};
  for(let tick=0;tick<warmupTicks;tick++){step();run.monitor.endFrame();}
  run.monitor.frames.length=0;run.monitor.current={times:{},counts:{},values:{}};run.monitor.lastValues={};run.monitor.lastFrameAt=run.monitor.clock();
  const warmupRebuilds=run.coolingRebuilds(),warmupPressureSolves=run.pressureSolves();
  const start=performance.now();
  for(let tick=0;tick<requestedTicks;tick++){step();run.monitor.endFrame();}
  const totalMs=performance.now()-start,profile=run.monitor.snapshot();
  const averageMsPerTick=totalMs/requestedTicks;
  measured.push({scenario:name,averageMsPerTick});
  process.stdout.write(JSON.stringify({scenario:name,...run.profile,ticks:requestedTicks,warmupTicks,totalMs:Number(totalMs.toFixed(2)),averageMsPerTick:Number(averageMsPerTick.toFixed(3)),coolingRebuilds:run.coolingRebuilds(),measuredCoolingRebuilds:run.coolingRebuilds()-warmupRebuilds,pressureSolves:run.pressureSolves()-warmupPressureSolves,profile:Object.fromEntries(['simulationMs','airflowMs','pressureMs','pressureIterationsAvg','pressureIterationsMax','pressureEarlyExitPercent','advectionSubstepsAvg','advectionSubstepsMax','coolingMs','thermalMs','thermalConductMs','thermalStatsMs','rackMs','fluidMs'].map(key=>[key,Number(profile[key].toFixed(3))]))})+'\n');
}

if(requireRelativeBudget){
  const result=relativeScalingGate(measured);
  process.stderr.write(`Relative scaling gate (limit ${result.limit}× per adjacent profile): ${JSON.stringify(result.ratios)}\n`);
  if(result.failed.length){process.stderr.write(`Performance scaling regression: ${JSON.stringify(result.failed)}\n`);process.exitCode=1;}
}
