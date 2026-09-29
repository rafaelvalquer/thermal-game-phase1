import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { MapBuilder } from '../../src/campaign/MapBuilder.js';
import { AirGrid } from '../../src/simulation/air/AirGrid.js';
import { AirPressureSolver } from '../../src/simulation/air/AirPressureSolver.js';
import { AirFaceTopologyCache } from '../../src/simulation/air/AirFaceTopologyCache.js';

test('adaptive pressure exits after minimum iterations when the field is converged',()=>{
  const world=new World(12,8);MapBuilder.apply(world,{rooms:[{x:1,y:1,w:10,h:6}]});
  const grid=new AirGrid(world);grid.syncTopology(true);
  const solver=new AirPressureSolver(grid);solver.solve(.05);
  assert.equal(solver.iterationsUsed,12);
  assert.equal(solver.earlyExit,true);
});

test('pressure stencil iterates only room interior cells and maps exterior neighbors to zero',()=>{
  const world=new World(12,8);MapBuilder.apply(world,{rooms:[{x:1,y:1,w:10,h:6}]});
  const grid=new AirGrid(world);grid.syncTopology(true);
  assert.ok(grid.interiorPressureCellCount>0);
  for(let c=0;c<grid.interiorPressureCellCount;c++)assert.equal(grid.exteriorCells[grid.interiorPressureCells[c]],0);
  for(let c=0;c<grid.interiorPressureCellCount;c++){
    const i=grid.interiorPressureCells[c],x=i%grid.width;
    if(x>0&&grid.exteriorCells[i-1])assert.equal(grid.pressureLeft[i],grid.size);
    if(x<grid.width-1&&grid.exteriorCells[i+1])assert.equal(grid.pressureRight[i],grid.size);
  }
});

test('air face topology is reused until air topology changes',()=>{
  const world=new World(10,7),grid=new AirGrid(world);grid.syncTopology(true);
  const cache=new AirFaceTopologyCache(grid);
  assert.equal(cache.ensure(),true);
  const faces=cache.openUFaces,airCells=cache.airCells;
  assert.equal(cache.ensure(),false);
  assert.equal(cache.openUFaces,faces);assert.equal(cache.airCells,airCells);
  world.setMaterial(5,3,'concrete');grid.syncTopology();
  assert.equal(cache.ensure(),true);
  assert.notEqual(cache.openUFaces,faces);
});
