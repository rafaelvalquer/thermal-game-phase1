import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { FluidSystem } from '../../src/simulation/FluidSystem.js';
import { Pump } from '../../src/entities/Pump.js';
import { Pipe } from '../../src/entities/Pipe.js';
import { HeatExchanger } from '../../src/entities/HeatExchanger.js';
import { Radiator } from '../../src/entities/Radiator.js';

function closedLoop(world){
  const entities=[new Pump(1,1,{x:1,y:0}),new Pipe(2,1),new HeatExchanger(3,1),new Pipe(3,2),new Radiator(3,3),new Pipe(2,3),new Pipe(1,3),new Pipe(1,2)];
  for(const entity of entities)world.addEntity(entity);return {pump:entities[0],entities};
}

test('hydraulic solution is reused for 1000 stable ticks and recalculated for pump changes only',()=>{
  const world=new World(8,8),loop=closedLoop(world),fluid=new FluidSystem(world,{});let solves=0;
  const solve=fluid.hydraulic.solveNetwork.bind(fluid.hydraulic);fluid.hydraulic.solveNetwork=network=>{solves++;return solve(network);};
  for(let tick=0;tick<1000;tick++)fluid.update(.05);
  assert.equal(solves,1);assert.equal(loop.pump.networkStatus,'CLOSED');
  loop.pump.hydraulicPower+=10;fluid.update(.05);assert.equal(solves,2);
  loop.pump.powerBlocked=true;fluid.update(.05);assert.equal(solves,3);assert.equal(loop.pump.networkStatus,'PUMP OFF');
  loop.entities.find(entity=>entity!==loop.pump).energy+=1e6;fluid.update(.05);assert.equal(solves,3,'thermal changes do not invalidate the hydraulic solution');
});
