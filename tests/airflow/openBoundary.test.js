import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { Fan } from '../../src/entities/Fan.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { MapBuilder } from '../../src/campaign/MapBuilder.js';

test('open map edges project boundary pressure into outward flow on all four sides',()=>{
  const world=new World(8,8),air=new AirflowSystem(world,{externalEnergy:0}),g=air.grid;
  for(let i=0;i<g.width;i++){
    g.pressure[g.cellIndex(i,0)]=100;
    g.pressure[g.cellIndex(i,g.height-1)]=100;
  }
  for(let i=0;i<g.height;i++){
    g.pressure[g.cellIndex(0,i)]=100;
    g.pressure[g.cellIndex(g.width-1,i)]=100;
  }

  air.pressure.project(.05);
  air.boundaries.enforce();

  for(let y=0;y<g.height;y++){
    assert.ok(g.u[g.uIndex(0,y)]<0,`left edge should flow out at y=${y}`);
    assert.ok(g.u[g.uIndex(g.width,y)]>0,`right edge should flow out at y=${y}`);
  }
  for(let x=0;x<g.width;x++){
    assert.ok(g.v[g.vIndex(x,0)]<0,`top edge should flow out at x=${x}`);
    assert.ok(g.v[g.vIndex(x,g.height)]>0,`bottom edge should flow out at x=${x}`);
  }
});

test('open boundaries reject incoming flow while preserving outgoing flow',()=>{
  const world=new World(8,8),air=new AirflowSystem(world,{externalEnergy:0}),g=air.grid;
  g.u[g.uIndex(0,1)]=2;g.u[g.uIndex(g.width,2)]=-2;
  g.v[g.vIndex(3,0)]=2;g.v[g.vIndex(4,g.height)]=-2;
  g.u[g.uIndex(0,3)]=-1;g.u[g.uIndex(g.width,4)]=1;
  g.v[g.vIndex(5,0)]=-1;g.v[g.vIndex(6,g.height)]=1;

  air.boundaries.enforce();

  assert.equal(g.u[g.uIndex(0,1)],0);assert.equal(g.u[g.uIndex(g.width,2)],0);
  assert.equal(g.v[g.vIndex(3,0)],0);assert.equal(g.v[g.vIndex(4,g.height)],0);
  assert.equal(g.u[g.uIndex(0,3)],-1);assert.equal(g.u[g.uIndex(g.width,4)],1);
  assert.equal(g.v[g.vIndex(5,0)],-1);assert.equal(g.v[g.vIndex(6,g.height)],1);
});

test('solid map edges remain sealed',()=>{
  const world=new World(8,8);world.setMaterial(0,2,'concrete');world.setMaterial(7,3,'concrete');
  world.setMaterial(4,0,'concrete');world.setMaterial(5,7,'concrete');
  const air=new AirflowSystem(world,{externalEnergy:0}),g=air.grid;
  g.u[g.uIndex(0,2)]=-2;g.u[g.uIndex(g.width,3)]=2;
  g.v[g.vIndex(4,0)]=-2;g.v[g.vIndex(5,g.height)]=2;

  air.boundaries.enforce();

  assert.equal(g.u[g.uIndex(0,2)],0);assert.equal(g.u[g.uIndex(g.width,3)],0);
  assert.equal(g.v[g.vIndex(4,0)],0);assert.equal(g.v[g.vIndex(5,g.height)],0);
});

test('fan pressure can discharge air through an open map edge',()=>{
  const world=new World(14,7),fan=world.addEntity(new Fan(11,3,{x:1,y:0}));
  fan.qFree=12;fan.pressureShutoff=80;
  const air=new AirflowSystem(world,{externalEnergy:0});
  for(let tick=0;tick<180;tick++)air.updateVelocity(.05);

  const outward=air.grid.u[air.grid.uIndex(world.width,3)];
  assert.ok(outward>0.01,`expected outward flow, got ${outward}`);
  assert.ok(world.airDiagnostics.maxDivergence<1.5,`divergence ${world.airDiagnostics.maxDivergence}`);
});

test('building exterior openings reject reverse flow and leave the room pressure-projected',()=>{
  const world=new World(14,9),metrics={externalEnergy:0};
  MapBuilder.apply(world,{rooms:[{x:2,y:2,w:9,h:5}],openings:[{x:2,y:4,w:1,h:1}]});
  const fan=world.addEntity(new Fan(5,4,{x:-1,y:0}));
  fan.qFree=12;fan.pressureShutoff=80;
  const air=new AirflowSystem(world,metrics),openingFace=air.grid.uIndex(2,4);
  for(let tick=0;tick<180;tick++)air.updateVelocity(.05);

  assert.equal(air.grid.exteriorCells[air.grid.cellIndex(1,4)],1,'outside cells are identified as exterior');
  assert.ok(air.grid.u[openingFace]<=0,`west opening must not pull air into the room, got ${air.grid.u[openingFace]}`);
  assert.ok(world.airDiagnostics.maxDivergence<1.5,`divergence ${world.airDiagnostics.maxDivergence}`);
});

test('outdoor vents preserve outward flow and block reverse flow',()=>{
  const world=new World(12,7);
  MapBuilder.apply(world,{rooms:[{x:2,y:1,w:8,h:5}],openings:[{x:2,y:3,w:1,h:1}]});
  const air=new AirflowSystem(world,{externalEnergy:0}),g=air.grid;
  const door=g.uIndex(2,3),mapEdge=g.uIndex(0,3);
  g.u[door]=-2;g.u[mapEdge]=-2;
  air.boundaries.enforce();
  assert.equal(g.u[door],-2,'outward doorway flow is preserved');
  assert.equal(g.u[mapEdge],-2,'outward map-edge flow is preserved');
  g.u[door]=2;air.boundaries.enforce();
  assert.equal(g.u[door],0,'reverse flow through an exterior doorway is blocked');
});
