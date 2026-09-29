import {performance} from 'node:perf_hooks';
import {World} from '../src/world/World.js';
import {ServerRack} from '../src/entities/ServerRack.js';
import {Technician} from '../src/entities/Technician.js';
import {TechnicianSystem} from '../src/simulation/TechnicianSystem.js';

const scenarios=[[50,5],[100,15],[200,30],[300,40]];
for(const [rackCount,workerCount] of scenarios){
  const world=new World(140,90);
  for(let index=0;index<rackCount;index++)world.addEntity(new ServerRack(8+(index%25)*5,5+Math.floor(index/25)*5,{temperature:48+index%15,slaTemperature:35,currentPowerKW:12}));
  for(let index=0;index<workerCount;index++)world.addEntity(new Technician(2+index%20,82-Math.floor(index/20)*2));
  const system=new TechnicianSystem(world,{budget:0});system.dispatcher.maxPathAttempts=64;
  const start=performance.now();system.dispatcher.dispatch();const dispatchMs=performance.now()-start;
  const pathfinder=system.pathfinder;
  const worker=system.workers[0];if(worker){pathfinder.findPath(worker.x,worker.y,worker.x,worker.y-20,worker);pathfinder.findPath(worker.x,worker.y,worker.x,worker.y-20,worker);}
  process.stdout.write(JSON.stringify({racks:rackCount,technicians:workerCount,dispatchMs:+dispatchMs.toFixed(3),dispatchCount:system.dispatcher.dispatchCount,bfsCalls:pathfinder.calculations,cellsVisited:pathfinder.cellsVisited,pathCacheHits:pathfinder.cacheHits,pathCacheHitRate:+(pathfinder.cacheHits/Math.max(1,pathfinder.cacheHits+pathfinder.calculations)).toFixed(3)})+'\n');
}
