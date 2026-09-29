import {performance} from 'node:perf_hooks';
import {World} from '../src/world/World.js';
import {Pipe} from '../src/entities/Pipe.js';
import {Pump} from '../src/entities/Pump.js';
import {FluidSystem} from '../src/simulation/FluidSystem.js';

const scenarios=[20,50,100,200];
function buildRing(componentCount){
  const width=componentCount/2-2,height=4,world=new World(width,height),positions=[];
  for(let x=0;x<width;x++)positions.push([x,0]);
  for(let y=1;y<height;y++)positions.push([width-1,y]);
  for(let x=width-2;x>=0;x--)positions.push([x,height-1]);
  for(let y=height-2;y>0;y--)positions.push([0,y]);
  const entities=positions.map(([x,y],index)=>index===0?world.addEntity(new Pump(x,y,{x:1,y:0})):world.addEntity(new Pipe(x,y)));
  return {world,entities};
}
const measure=fn=>{const start=performance.now();fn();return +(performance.now()-start).toFixed(3);};
for(const count of scenarios){
  const {world,entities}=buildRing(count),fluid=new FluidSystem(world,{});
  const buildNetwork=measure(()=>fluid.networks=fluid.buildNetworks());
  const network=fluid.networks[0];
  const hydraulicSolve=measure(()=>fluid.hydraulic.solveIfNeeded(network));
  const thermalTransport=measure(()=>fluid.transport(network,1/20));
  process.stdout.write(JSON.stringify({components:entities.length,buildNetworkMs:buildNetwork,hydraulicSolveMs:hydraulicSolve,thermalTransportMs:thermalTransport,hydraulicStatus:network.status,hydraulicSolveCount:fluid.hydraulic.solveCount})+'\n');
}
