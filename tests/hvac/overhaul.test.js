import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { AirHandler } from '../../src/entities/AirHandler.js';
import { Condenser } from '../../src/entities/Condenser.js';
import { RefrigerantLine } from '../../src/entities/RefrigerantLine.js';
import { ReturnVent } from '../../src/entities/ReturnVent.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { DuctDamper } from '../../src/entities/DuctDamper.js';
import { PlacementValidator } from '../../src/building/PlacementValidator.js';
import { HVACPortResolver } from '../../src/simulation/hvac/ports/HVACPortResolver.js';
import { DuctNetworkBuilder } from '../../src/simulation/hvac/DuctNetworkBuilder.js';
import { DuctFlowSolver } from '../../src/simulation/hvac/DuctFlowSolver.js';
import { RefrigerantNetworkBuilder } from '../../src/simulation/hvac/refrigerant/RefrigerantNetworkBuilder.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { HVACSystem } from '../../src/simulation/hvac/HVACSystem.js';
import { rotatePort } from '../../src/rendering/sprites/SpriteDefinition.js';

function addLine(world,from,to,{horizontalFirst=true}={}){
  let {x,y}=from;const cells=[{x,y}];
  const advance=(axis,target)=>{while((axis==='x'?x:y)!==target){if(axis==='x')x+=Math.sign(target-x);else y+=Math.sign(target-y);cells.push({x,y});}};
  if(horizontalFirst){advance('x',to.x);advance('y',to.y);}else{advance('y',to.y);advance('x',to.x);}
  for(const cell of cells)world.addUtility(new RefrigerantLine(cell.x,cell.y));
  return cells;
}

function addDuctRun(world,points){for(const [x,y] of points)world.addUtility(new AirDuct(x,y));}

test('air handler ports rotate as one physical assembly and keep the three services separate',()=>{
  const resolver=new HVACPortResolver(),handler=new AirHandler(4,4);
  const cells=()=>Object.fromEntries(resolver.airHandler(handler).map(port=>[port.type,port.cell]));
  assert.deepEqual(cells(),{supply:{x:3,y:4},return:{x:5,y:4},refrigerant:{x:4,y:5}});
  handler.rotate();
  assert.deepEqual(cells(),{supply:{x:4,y:3},return:{x:4,y:5},refrigerant:{x:3,y:4}});
  assert.deepEqual(handler.direction,{x:0,y:1});
});

test('supply and return classification is the same when the handler is installed before or after ducts',()=>{
  const makeWorld=handlerFirst=>{
    const world=new World(8,9),handler=new AirHandler(2,2,{rotation:1}),vent=new ReturnVent(2,6);
    if(handlerFirst)world.addEntity(handler);
    world.addEntity(vent);addDuctRun(world,[[2,3],[2,4],[2,5]]);
    if(!handlerFirst)world.addEntity(handler);
    const network=new DuctNetworkBuilder(world).build().find(item=>item.role==='return');
    assert.equal(network.status,'READY');return network;
  };
  const first=makeWorld(true),second=makeWorld(false);
  assert.equal(first.role,'return');assert.equal(second.role,'return');
  assert.deepEqual(first.ducts.map(item=>item.networkRole),['return','return','return']);
  assert.deepEqual(second.ducts.map(item=>item.networkRole),['return','return','return']);
});

test('air topology cache survives temperature and damper adjustments, then rebuilds on utility changes',()=>{
  const world=new World(8,7),handler=new AirHandler(1,2,{rotation:2});
  world.addEntity(handler);world.addEntity(new SupplyVent(5,2));addDuctRun(world,[[2,2],[3,2],[4,2]]);
  const damper=new DuctDamper(3,2);world.addUtility(damper);
  const builder=new DuctNetworkBuilder(world),first=builder.build();
  world.setTemperature(0,0,32);damper.setOpening(.5);
  assert.equal(builder.build(),first);assert.equal(builder.rebuildCount,1);
  world.addUtility(new RefrigerantLine(7,6));
  assert.notEqual(builder.build(),first);assert.equal(builder.rebuildCount,2);
});

test('mixed supply and return terminals on one duct component are rejected with zero flow',()=>{
  const world=new World(9,8),handler=new AirHandler(2,2);
  world.addEntity(handler);world.addEntity(new SupplyVent(0,2));world.addEntity(new ReturnVent(5,2));
  addDuctRun(world,[[1,2],[1,3],[1,4],[2,4],[3,4],[3,3],[3,2],[4,2]]);
  const network=new DuctNetworkBuilder(world).build().find(item=>item.airHandlers.includes(handler));
  assert.equal(network.status,'SUPPLY / RETURN CROSS-CONNECTION');
  assert.equal(network.role,'invalid');assert.equal(new DuctFlowSolver(world).solve(network).flowRate,0);
});

test('HVAC utilities share a wall without opening it to room airflow',()=>{
  const world=new World(9,7),handler=new AirHandler(1,2),condenser=new Condenser(6,2);
  world.setMaterial(4,3,'concrete');world.addEntity(handler);world.addEntity(condenser);
  const path=[...addLine(world,{x:1,y:3},{x:5,y:3}),...addLine(world,{x:5,y:3},{x:5,y:1},{horizontalFirst:false}).slice(1),...addLine(world,{x:5,y:1},{x:6,y:1}).slice(1)];
  const duct=new AirDuct(4,3,{embedded:true});assert.equal(world.addUtility(duct),duct);
  assert.equal(world.utilitiesAt(4,3).filter(item=>item.x===4&&item.y===3).length,2);
  const circuits=new RefrigerantNetworkBuilder(world).build();
  assert.equal(circuits.length,1);assert.equal(circuits[0].status,'READY');
  assert.ok(path.every(cell=>world.utilityAt(cell.x,cell.y,'refrigerantLine')));
  const airflow=new AirflowSystem(world,{generatedHeat:0,powerDraw:0});airflow.grid.syncTopology(true);
  assert.equal(world.materialAt(4,3).id,'concrete');assert.equal(airflow.grid.isSolid(4,3),true);
});

test('placement accepts only matching air and refrigerant ports',()=>{
  const world=new World(8,8),handler=new AirHandler(3,3),condenser=new Condenser(6,3),vent=new SupplyVent(3,6);
  world.addEntity(handler);world.addEntity(condenser);world.addEntity(vent);
  const validator=new PlacementValidator(world);
  assert.equal(validator.canPlace('mediumDuct',2,3),true,'left supply port accepts an air duct');
  assert.equal(validator.canPlace('mediumDuct',4,3),true,'right return port accepts an air duct');
  assert.equal(validator.canPlace('mediumDuct',3,2),false,'wrong-side placement is rejected');
  assert.equal(validator.canPlace('mediumDuct',3,4),false,'the refrigerant port must not accept an air duct');
  assert.equal(validator.canPlace('supplyVent',2,3),false,'a vent cannot occupy the duct socket');
  assert.equal(validator.canPlace('returnVent',4,3),false,'a vent cannot occupy the duct socket');
  assert.equal(validator.canPlace('mediumDuct',5,3),false,'a condenser is not an air-duct terminal');
  assert.equal(validator.canPlace('refrigerantLine',2,3),false,'the supply port must not accept refrigerant');
  assert.equal(validator.canPlace('refrigerantLine',3,4),true);
  assert.equal(validator.canPlace('refrigerantLine',3,5),false,'refrigerant must not connect to an air vent');
});

test('a vent placed directly on an Air Handler socket cannot bypass the required duct',()=>{
  const world=new World(8,8),handler=new AirHandler(3,3);world.addEntity(handler);world.addEntity(new SupplyVent(2,3));
  const networks=new DuctNetworkBuilder(world).build();
  assert.equal(networks.some(network=>network.airHandlers.includes(handler)),false);
  assert.equal(handler.supplyNetworkId,null);
});

test('refrigerant topology distinguishes an open run, missing condenser, and removed live connection',()=>{
  const world=new World(12,8),handler=new AirHandler(2,2),builder=new RefrigerantNetworkBuilder(world);
  world.addEntity(handler);world.addUtility(new RefrigerantLine(2,3));world.addUtility(new RefrigerantLine(8,6));
  let circuits=builder.build();
  assert.ok(circuits.some(item=>item.status==='NO CONDENSER'));
  assert.ok(circuits.some(item=>item.status==='OPEN CIRCUIT'));
  const condenser=new Condenser(8,2);world.addEntity(condenser);
  addLine(world,{x:2,y:3},{x:7,y:3});addLine(world,{x:7,y:3},{x:7,y:1});addLine(world,{x:7,y:1},{x:8,y:1});
  circuits=builder.build();
  const connected=circuits.find(item=>item.handlers.includes(handler));
  assert.equal(connected.status,'READY');
  world.removeUtility(world.utilityAt(2,3,'refrigerantLine'));
  circuits=builder.build();
  assert.equal(circuits.find(item=>item.handlers.includes(handler)),undefined);
  assert.equal(handler.refrigerantCircuitId,null);
});

test('long refrigerant line receives a capacity derating and a clear warning state',()=>{
  const world=new World(100,7),handler=new AirHandler(1,1),condenser=new Condenser(90,2);
  world.addEntity(handler);world.addEntity(condenser);
  addLine(world,{x:1,y:2},{x:89,y:2});addLine(world,{x:89,y:2},{x:89,y:1});addLine(world,{x:89,y:1},{x:90,y:1});
  const circuit=new RefrigerantNetworkBuilder(world).build().find(item=>item.handlers.includes(handler));
  assert.equal(circuit.status,'LINE TOO LONG');assert.ok(circuit.capacityFactor<.7);
});

test('an air handler without a refrigerant line reports the missing service',()=>{
  const world=new World(8,7),handler=new AirHandler(1,2,{rotation:2});world.addEntity(handler);world.addEntity(new SupplyVent(5,2));world.addEntity(new ReturnVent(1,5));
  addDuctRun(world,[[2,2],[3,2],[4,2],[0,2],[0,3],[0,4],[0,5]]);
  new HVACSystem(world,null,{generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0}).update(.1);
  assert.equal(handler.status,'NO REFRIGERANT LINE');
});

test('default air-handler ports match the sprite definition and rotate through all four sides',async()=>{
  const {SPRITES}=await import('../../src/rendering/sprites/SpriteManifest.js');
  const world=new World(10,10),handler=new AirHandler(4,4),validator=new PlacementValidator(world);world.addEntity(handler);
  const expected=[
    {supply:{x:3,y:4},return:{x:5,y:4},refrigerant:{x:4,y:5}},
    {supply:{x:4,y:3},return:{x:4,y:5},refrigerant:{x:3,y:4}},
    {supply:{x:5,y:4},return:{x:3,y:4},refrigerant:{x:4,y:3}},
    {supply:{x:4,y:5},return:{x:4,y:3},refrigerant:{x:5,y:4}},
  ];
  const resolver=new HVACPortResolver();
  for(let rotation=0;rotation<4;rotation++){
    const cells=Object.fromEntries(resolver.airHandler(handler).map(port=>[port.type,port.cell]));
    assert.deepEqual(cells,expected[rotation]);
    const manifest=Object.fromEntries(SPRITES.airHandler.ports.map(port=>{
      const visual=rotatePort(port,rotation*Math.PI/2);
      return [port.service,{x:4+(visual.x-.5)*2,y:4+(visual.y-.5)*2}];
    }));
    assert.deepEqual(manifest,cells,'rotated sprite connectors agree with physical connector cells');
    assert.equal(validator.canPlace('mediumDuct',cells.supply.x,cells.supply.y),true,'supply port accepts duct');
    assert.equal(validator.canPlace('mediumDuct',cells.return.x,cells.return.y),true,'return port accepts duct');
    assert.equal(validator.canPlace('mediumDuct',cells.refrigerant.x,cells.refrigerant.y),false,'refrigerant port rejects duct');
    assert.equal(validator.canPlace('refrigerantLine',cells.refrigerant.x,cells.refrigerant.y),true,'refrigerant port accepts line');
    const occupied=new Set(Object.values(cells).map(cell=>`${cell.x},${cell.y}`));
    const wrong=[[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dy])=>({x:handler.x+dx,y:handler.y+dy})).find(cell=>!occupied.has(`${cell.x},${cell.y}`));
    assert.equal(validator.canPlace('mediumDuct',wrong.x,wrong.y),false,'other Air Handler sides reject ducts');
    handler.rotate();
  }
});

test('missing each of the three physical services prevents HVAC operation',()=>{
  const runWithoutSupply=()=>{
    const world=new World(10,8),handler=new AirHandler(3,3),condenser=new Condenser(7,4);
    world.addEntity(handler);world.addEntity(condenser);world.addEntity(new ReturnVent(5,1));
    addDuctRun(world,[[4,3],[4,2],[4,1]]);
    for(const [x,y] of [[3,4],[4,4],[5,4],[6,4],[6,3],[7,3]])world.addUtility(new RefrigerantLine(x,y));
    const hvac=new HVACSystem(world,null,{generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0});
    hvac.update(.1);hvac.exchangeRooms(.1);return handler;
  };
  const handler=runWithoutSupply();
  assert.equal(handler.status,'NO SUPPLY NETWORK');assert.equal(handler.currentFlow,0);assert.equal(handler.coolingPower,0);
});

test('the default left-supply right-return and lower-refrigerant assembly runs as one complete system',()=>{
  const world=new World(10,8),handler=new AirHandler(3,3),condenser=new Condenser(7,4);
  world.addEntity(handler);world.addEntity(condenser);
  world.addEntity(new SupplyVent(0,3));world.addEntity(new ReturnVent(6,3));
  addDuctRun(world,[[2,3],[1,3],[4,3],[5,3]]);
  for(const [x,y] of [[3,4],[4,4],[5,4],[6,4],[6,3],[7,3]])world.addUtility(new RefrigerantLine(x,y));
  const metrics={generatedHeat:0,externalEnergy:0,powerDraw:0,powerEnergy:0,energyBalance:0};
  const hvac=new HVACSystem(world,null,metrics);hvac.update(.1);hvac.exchangeRooms(.1);
  assert.ok(handler.status==='READY'||handler.status==='OVERLOAD');
  assert.ok(handler.currentFlow>0);assert.ok(handler.coolingPower>0);
  assert.equal(handler.supplyNetworkId!=null,true);assert.equal(handler.returnNetworkId!=null,true);
  assert.equal(hvac.refrigerantCircuitFor(handler).status,'READY');
});
