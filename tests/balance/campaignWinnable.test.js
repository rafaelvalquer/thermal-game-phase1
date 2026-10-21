import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_SOLUTIONS, runReference } from './referenceSolutions.js';
import { rateMission } from '../../src/campaign/StarRating.js';

for(const number of Object.keys(REFERENCE_SOLUTIONS).map(Number)){
  test('level '+number+' is winnable with its reference build',()=>{
    const {level,sim,failures,result}=runReference(number);
    assert.deepEqual(failures,[],'every reference placement is valid');
    assert.ok(result.cost<=level.budget,'within budget');
    assert.equal(sim.mission.state,'won',sim.mission.failReason||sim.mission.objectives.firstFailure()?.label);
    assert.ok(rateMission(level,result,true).stars>=1);
  });
}
