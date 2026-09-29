import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { AirGrid } from '../../src/simulation/air/AirGrid.js';
import { AirPressureSolver } from '../../src/simulation/air/AirPressureSolver.js';

function referenceSolve(grid,iterations,dt){
  const rhsScale=1.225*grid.dx*grid.dx/Math.max(dt,1e-6);
  grid.pressureNext.set(grid.pressure);
  for(let iter=0;iter<iterations;iter++){
    for(let i=0;i<grid.size;i++){
      if(grid.solid[i]){grid.pressureNext[i]=0;continue;}
      const sum=grid.pressure[grid.pressureLeft[i]]+grid.pressure[grid.pressureRight[i]]+grid.pressure[grid.pressureUp[i]]+grid.pressure[grid.pressureDown[i]];
      const count=grid.pressureNeighborCount[i];
      grid.pressureNext[i]=count?(sum-rhsScale*grid.divergence[i])/count:0;
    }
    [grid.pressure,grid.pressureNext]=[grid.pressureNext,grid.pressure];
  }
}

test('pressure solver matches the full-grid reference for odd and even iteration counts',()=>{
  for(const iterations of [1,2,39,40,41]){
    const world=new World(18,12);
    for(let y=1;y<11;y++)world.setMaterial(7,y,'concrete');
    for(let x=9;x<15;x++)world.setMaterial(x,6,'concrete');
    const grid=new AirGrid(world);grid.syncTopology(true);
    for(let i=0;i<grid.size;i++){
      grid.pressure[i]=grid.solid[i]?0:Math.sin(i*.37)*8;
      grid.divergence[i]=grid.solid[i]?0:Math.cos(i*.19)*.4;
    }
    const referencePressure=grid.pressure.slice(),referenceNext=grid.pressureNext.slice();
    const expected={...grid,pressure:referencePressure,pressureNext:referenceNext};
    referenceSolve(expected,iterations,.037);
    const solver=new AirPressureSolver(grid,{iterations});solver.solve(.037);
    assert.deepEqual(grid.pressure,expected.pressure,`pressure mismatch at ${iterations} iterations`);
    assert.deepEqual(grid.pressureNext,expected.pressureNext,`next buffer mismatch at ${iterations} iterations`);
    assert.equal(world.airPressure,grid.pressure);
  }
});
