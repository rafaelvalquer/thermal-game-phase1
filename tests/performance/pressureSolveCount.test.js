import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirflowSystem } from '../../src/simulation/air/AirflowSystem.js';

test('airflow resolves pressure once with ten cooling units and twenty supply vents',()=>{
  const world=new World(100,24),metrics={},airflow=new AirflowSystem(world,metrics);
  for(let i=0;i<10;i++)world.addEntity(new CoolingUnit(2+i*9,2));
  const vents=[];for(let i=0;i<20;i++){const vent=world.addEntity(new SupplyVent(2+i*4,12));vent.flowRate=.4;vents.push({vent});}
  let solves=0;const solve=airflow.pressure.solve.bind(airflow.pressure);airflow.pressure.solve=dt=>{solves++;return solve(dt);};
  airflow.queueCoolingMomentum(vents,.05);airflow.updateVelocity(.05);
  assert.equal(solves,1);
});
