import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../src/world/World.js';
import { CoolingUnit } from '../../src/entities/CoolingUnit.js';
import { AirDuct } from '../../src/entities/AirDuct.js';
import { SupplyVent } from '../../src/entities/SupplyVent.js';
import { AirflowSystem } from '../../src/simulation/AirflowSystem.js';
import { CoolingSystem } from '../../src/simulation/cooling/CoolingSystem.js';

test('three units own independent full-capacity networks and add cooling in one room',()=>{
  const world=new World(12,8),room={id:'shared-room',x:3,y:0,width:9,height:8};
  world.zones=[room];
  for(let y=0;y<8;y++)for(let x=3;x<12;x++)world.setTemperature(x,y,32);

  const units=[];
  for(const y of [1,3,5]){
    const unit=new CoolingUnit(0,y);unit.missionId=`ac-${y}`;world.addEntity(unit);
    world.addUtility(new AirDuct(1,y,{size:'duct'}));
    world.addUtility(new AirDuct(2,y,{size:'duct'}));
    world.addEntity(new SupplyVent(3,y));units.push(unit);
  }
  units[2].enabled=false;
  const metrics={generatedHeat:0,externalEnergy:0},airflow=new AirflowSystem(world,metrics);
  const cooling=new CoolingSystem(world,airflow,metrics);

  cooling.update(1);
  airflow.updateVelocity(1);
  cooling.exchangeRooms(1);

  assert.equal(cooling.networks.length,3);
  assert.ok(cooling.networks.every(network=>network.status==='READY'));
  assert.deepEqual(units.map(unit=>unit.availableCapacity),[25000,25000,0]);
  assert.ok(units[0].currentAirFlow>0&&units[1].currentAirFlow>0);
  assert.equal(units[2].currentAirFlow,0);
  assert.ok(units[0].currentCooling>0&&units[1].currentCooling>0);
  assert.equal(units[2].currentCooling,0);
  assert.ok(Math.abs(metrics.coolingDelivered-units[0].currentCooling-units[1].currentCooling)<1e-8);
  assert.notEqual(units[0].networkId,units[1].networkId);
  assert.notEqual(units[1].networkId,units[2].networkId);

  world.removeEntity(units[0]);
  const replacement=new CoolingUnit(0,7);replacement.missionId='ac-4';world.addEntity(replacement);
  cooling.update(1);
  assert.equal(units[1].unitLabel,'AC-02');
  assert.equal(units[2].unitLabel,'AC-03');
  assert.equal(replacement.unitLabel,'AC-04');
});
