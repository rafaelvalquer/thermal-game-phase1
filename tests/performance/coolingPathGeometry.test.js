import test from 'node:test';
import assert from 'node:assert/strict';
import { CoolingPathGeometryCache } from '../../src/rendering/cooling/CoolingPathGeometryCache.js';

test('cooling path geometry is constructed once and located without segment scans',()=>{
  let builds=0;const cache=new CoolingPathGeometryCache({monitor:{count(name){if(name==='coolingPathAllocations')builds++;}}});
  const unit={x:0,y:0},ductA={x:1,y:0},ductB={x:1,y:1},vent={x:2,y:1};
  const path={unit,path:[ductA,ductB],vent},network={sourceUnit:unit};
  const first=cache.get(path,network),second=cache.get(path,network);
  assert.equal(first,second);assert.equal(builds,1);assert.equal(first.segments.length,3);assert.equal(first.totalLength,3);
  assert.equal(CoolingPathGeometryCache.segmentAt(first.segments,.5),first.segments[0]);
  assert.equal(CoolingPathGeometryCache.segmentAt(first.segments,1.5),first.segments[1]);
  assert.equal(CoolingPathGeometryCache.segmentAt(first.segments,2.5),first.segments[2]);
});
