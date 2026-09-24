import test from 'node:test';
import assert from 'node:assert/strict';
import { Inspector } from '../../src/ui/Inspector.js';
import { World } from '../../src/world/World.js';
import { Machine } from '../../src/entities/Machine.js';
import { ExhaustFan } from '../../src/entities/ExhaustFan.js';

test('Inspector distinguishes flow efficiency from motor efficiency and displays outlet state',()=>{
  const world=new World(8,8),exhaust=world.addEntity(new ExhaustFan(4,4)),root={innerHTML:'',querySelector:()=>null};
  exhaust.flowEfficiency=.83;exhaust.status='NO OUTLET';
  const inspector=new Inspector(root);inspector.setTarget({kind:'entity',entity:exhaust});inspector.update(world);
  assert.match(root.innerHTML,/Eficiência fluxo/);assert.match(root.innerHTML,/83%/);
  assert.match(root.innerHTML,/NO OUTLET/);assert.match(root.innerHTML,/Calor rejeitado/);
});

test('Inspector displays machine generation, cooling and signed balance',()=>{
  const world=new World(8,8),machine=world.addEntity(new Machine(4,4)),root={innerHTML:'',querySelector:()=>null};
  machine.heatGenerationPower=15000;machine.coolingPower=12400;machine.thermalBalance=-2600;
  const inspector=new Inspector(root);inspector.setTarget({kind:'entity',entity:machine});inspector.update(world);
  assert.match(root.innerHTML,/Geração/);assert.match(root.innerHTML,/Resfriamento/);
  assert.match(root.innerHTML,/Balanço/);assert.match(root.innerHTML,/-2\.60 kW/);
});
