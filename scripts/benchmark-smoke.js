import assert from 'node:assert/strict';
import {World} from '../src/world/World.js';
import {CoolingUnit} from '../src/entities/CoolingUnit.js';
import {SupplyVent} from '../src/entities/SupplyVent.js';
import {ServerRack} from '../src/entities/ServerRack.js';
import {AirDuct} from '../src/entities/AirDuct.js';
import {Pipe} from '../src/entities/Pipe.js';
import {Pump} from '../src/entities/Pump.js';
import {Simulation} from '../src/simulation/Simulation.js';
import {FluidSystem} from '../src/simulation/FluidSystem.js';

const world=new World(48,32);
for(let i=0;i<3;i++){
  const y=2+i*3;world.addEntity(new CoolingUnit(0,y,{direction:{x:1,y:0}}));
  for(let x=1;x<=6;x++)world.addUtility(new AirDuct(x,y,{size:'duct'}));
  world.addEntity(new SupplyVent(7,y,{direction:{x:1,y:0}}));
}
for(let i=0;i<30;i++)world.addEntity(new ServerRack(20+i%10,8+Math.floor(i/10),{startAt:0,maxPowerKW:12,currentPowerKW:8,temperature:31}));
const level={id:'performance-smoke',map:{width:world.width,height:world.height},thermalSystems:{simpleCooling:true,waterCooling:false},missionDuration:Infinity,objectives:[],failures:[],events:[],powerLimit:1e9};
const simulation=new Simulation(world,level);simulation.initialize();let coolingTopologyRebuilds=0,pressureSolves=0;
const build=simulation.cooling.builder.build.bind(simulation.cooling.builder),solve=simulation.airflow.pressure.solve.bind(simulation.airflow.pressure);
simulation.cooling.builder.build=(...args)=>{coolingTopologyRebuilds++;return build(...args);};simulation.airflow.pressure.solve=(...args)=>{pressureSolves++;return solve(...args);};
const ticks=12;for(let i=0;i<ticks;i++)simulation.update(1/20);
assert.ok(coolingTopologyRebuilds<=1,`cooling rebuild count ${coolingTopologyRebuilds} exceeded 1`);
assert.equal(pressureSolves,ticks,'pressure solve count must match simulation ticks');
const fluidWorld=new World(8,4);fluidWorld.addEntity(new Pump(0,0,{x:1,y:0}));
for(const [x,y] of [[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[6,1],[6,2],[6,3],[5,3],[4,3],[3,3],[2,3],[1,3],[0,3],[0,2],[0,1]])fluidWorld.addEntity(new Pipe(x,y));
const fluid=new FluidSystem(fluidWorld,{});fluid.update(1/20);fluid.update(1/20);
assert.ok(fluid.hydraulic.solveCount<=2,`hydraulic solve count ${fluid.hydraulic.solveCount} exceeded 2`);
process.stdout.write(JSON.stringify({ok:true,ticks,coolingTopologyRebuilds,pressureSolves,hydraulicSolves:fluid.hydraulic.solveCount})+'\n');
