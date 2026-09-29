import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Pump } from '../../src/entities/Pump.js';
import { Pipe } from '../../src/entities/Pipe.js';
import { HeatExchanger } from '../../src/entities/HeatExchanger.js';
import { Radiator } from '../../src/entities/Radiator.js';
import { FluidSystem } from '../../src/simulation/FluidSystem.js';

test('fluid transport reuses typed-array state across 1000 closed-loop ticks without losing energy',()=>{
  const world=new World(6,6),entities=[new Pump(1,1,{x:1,y:0}),new Pipe(2,1),new HeatExchanger(3,1),new Pipe(3,2),new Radiator(3,3),new Pipe(2,3),new Pipe(1,3),new Pipe(1,2)];
  entities.forEach((entity,index)=>{entity.energy=entity.waterMass*4186*(20+index*2);world.addEntity(entity);});
  const system=new FluidSystem(world,{});system.update(.05);const network=system.networks[0],runtime=network.runtime;
  assert.equal(network.closed,true);const buffers=[runtime.temperatures,runtime.energyDelta,runtime.incomingFlow,runtime.incomingTemperatureFlow];
  const energyBefore=network.entities.reduce((sum,entity)=>sum+entity.energy,0);
  for(let tick=0;tick<1000;tick++)system.transport(network,.05);
  assert.deepEqual([runtime.temperatures,runtime.energyDelta,runtime.incomingFlow,runtime.incomingTemperatureFlow],buffers);
  assert.ok(Math.abs(network.entities.reduce((sum,entity)=>sum+entity.energy,0)-energyBefore)<1e-5);
  assert.ok(runtime.temperatures instanceof Float64Array);assert.ok(runtime.energyDelta instanceof Float64Array);assert.equal(system.networks[0],network);
});
