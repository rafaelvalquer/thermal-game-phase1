import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { AirHandler } from '../../src/entities/AirHandler.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { DuctNetworkBuilder } from '../../src/simulation/hvac/DuctNetworkBuilder.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { DuctFlowSolver } from '../../src/simulation/hvac/DuctFlowSolver.js';

test('embedded duct crosses a solid wall while the room airflow grid stays blocked',()=>{
  const world=new World(7,5),metrics={generatedHeat:0,powerDraw:0};world.setMaterial(3,2,'concrete');
  const handler=new AirHandler(1,2),vent=new SupplyVent(5,2);
  world.addEntity(handler);world.addEntity(vent);world.addUtility(new AirDuct(2,2));world.addUtility(new AirDuct(3,2,{embedded:true}));world.addUtility(new AirDuct(4,2));
  const airflow=new AirflowSystem(world,metrics);airflow.grid.syncTopology(true);
  const network=new DuctNetworkBuilder(world).build().find(item=>item.role==='supply');
  assert.equal(network.status,'READY');
  new DuctFlowSolver(world).solve(network);
  assert.ok(network.flowRate>0);
  assert.equal(world.materialAt(3,2).id,'concrete');assert.equal(airflow.grid.isSolid(3,2),true);
  assert.equal(world.airX[world.index(3,2)],0);assert.equal(world.airY[world.index(3,2)],0);
});
