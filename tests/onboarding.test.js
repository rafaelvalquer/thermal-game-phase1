import test from 'node:test';
import assert from 'node:assert/strict';
import { LevelManager } from '../src/campaign/LevelManager.js';
import { level01 } from '../src/campaign/levels/level01.js';
import { level02 } from '../src/campaign/levels/level02.js';
import { engineeringSandbox } from '../src/campaign/engineeringSandbox.js';
import { datacenterSandbox } from '../src/campaign/datacenterSandbox.js';
import { LEVELS } from '../src/campaign/levels/index.js';
import { usesPlanningPhase } from '../src/campaign/MissionRuntime.js';
import { Simulation } from '../src/simulation/Simulation.js';
import { BuildSystem } from '../src/building/BuildSystem.js';
import { World } from '../src/world/World.js';
import { Machine } from '../src/entities/Machine.js';
import { MetricsPanel, telemetryLevel } from '../src/ui/MetricsPanel.js';
import { ObjectivePanel } from '../src/ui/ObjectivePanel.js';
import { TUTORIAL_CHECKS, evaluateTutorialCheck, nextTutorialIndex } from '../src/ui/TutorialOverlay.js';
import { airReachCells, previewAirReach } from '../src/rendering/AirReachPreview.js';

const setup=(level=level01,{planning=true}={})=>{
  const world=new LevelManager().load(level),sim=new Simulation(world,level,{planning});sim.initialize();
  const build=new BuildSystem(world,sim,{budget:level.budget,inventory:level.inventory});
  return {world,sim,build,level,renderer:{mode:'normal'}};
};
const machines=world=>world.entities.filter(entity=>entity.isHeatMachine);

test('planning phase freezes the simulation until the operation starts',()=>{
  const {world,sim}=setup();
  assert.equal(sim.mission.state,'planning');assert.equal(sim.planning,true);
  for(let i=0;i<40;i++)sim.update(.05);
  assert.equal(sim.elapsed,0);
  assert.ok(machines(world).every(machine=>machine.temperature===25));
  assert.ok(sim.mission.objectiveStatus.every(status=>status.state==='waiting'));
});

test('starting the operation replaces the 10 s countdown',()=>{
  const {world,sim}=setup();
  sim.paused=true;
  assert.equal(sim.startOperation(),true);
  assert.equal(sim.mission.state,'running');assert.equal(sim.paused,false);
  assert.equal(sim.startOperation(),false);
  assert.ok(machines(world).every(machine=>machine.startAt===0));
  sim.update(.05);
  assert.ok(machines(world).every(machine=>machine.started));
  assert.ok(!sim.mission.message.startsWith('Preparação'));
  assert.ok(sim.mission.objectiveStatus.every(status=>status.state!=='waiting'));
});

test('only campaign missions start in planning',()=>{
  for(const level of LEVELS)assert.equal(usesPlanningPhase(level),true,level.id);
  assert.equal(usesPlanningPhase(engineeringSandbox),false);
  assert.equal(usesPlanningPhase(datacenterSandbox),false);
  assert.equal(usesPlanningPhase({...level01,performanceBenchmark:'A'}),false);
  assert.equal(usesPlanningPhase({...level01,planningPhase:false}),false);
});

test('event-activated machines keep their own start time',()=>{
  const world=new World(6,6),late=world.addEntity(new Machine(2,2,{startAt:99999})),early=world.addEntity(new Machine(4,4,{}));
  const level={id:'t',objectives:[],failures:[],events:[],missionDuration:300};
  const sim=new Simulation(world,level,{planning:true});sim.initialize();sim.startOperation();
  assert.equal(early.startAt,0);assert.equal(late.startAt,99999);
});

test('without planning, objectives wait for the preparation countdown instead of showing ✓',()=>{
  const {sim}=setup(level01,{planning:false});
  assert.equal(sim.mission.state,'running');
  sim.update(.05);
  assert.ok(sim.mission.waiting);
  assert.ok(sim.mission.objectiveStatus.every(status=>status.state==='waiting'));
  const root={innerHTML:''};new ObjectivePanel(root).update(sim);
  assert.match(root.innerHTML,/Aguardando as máquinas ligarem/);
  assert.doesNotMatch(root.innerHTML,/✓/);
  for(let i=0;i<220;i++)sim.update(.05);
  assert.equal(sim.mission.waiting,false);
  assert.ok(sim.mission.objectiveStatus.every(status=>status.state==='ok'||status.state==='pending'));
});

test('telemetry is revealed by level: Hot Room shows temperature, consumption and mission only',()=>{
  assert.equal(telemetryLevel(level01),1);assert.equal(telemetryLevel(level02),2);
  assert.equal(telemetryLevel({}),3);assert.equal(telemetryLevel(engineeringSandbox),3);
  const render=level=>{const {sim,build}=setup(level);const root={innerHTML:''};new MetricsPanel(root).update(sim,build,level);return root.innerHTML;};
  const basic=render(level01);
  assert.match(basic,/Consumo/);assert.match(basic,/Máquina mais quente/);assert.match(basic,/Estabilidade da missão/);
  assert.doesNotMatch(basic,/Balanço energético|Calor gerado|Capacidade instalada/);
  const standard=render(level02);
  assert.match(standard,/Capacidade instalada/);assert.doesNotMatch(standard,/Balanço energético/);
  assert.match(render({...level02,uiLevel:3}),/Balanço energético/);
});

test('engineering sandbox does not inherit the Hot Room tutorial',()=>{
  assert.equal(engineeringSandbox.tutorial,null);
  assert.ok(level01.tutorial.steps.length>=5);
  for(const step of level01.tutorial.steps){
    assert.ok(TUTORIAL_CHECKS[step.check],step.id);
    if(step.warning)assert.ok(TUTORIAL_CHECKS[step.warning.check],step.id+' warning');
  }
});

test('Hot Room tutorial checks follow the player actions',()=>{
  const game=setup(),{world,build,sim}=game,step=id=>level01.tutorial.steps.find(item=>item.id===id),passes=id=>evaluateTutorialCheck(game,step(id));
  assert.equal(passes('select-unit'),false);
  build.select('coolingUnit');assert.equal(passes('select-unit'),true);
  assert.equal(build.coolingUnitModel,'compact');
  build.place(30,30);
  assert.equal(passes('place-unit'),false);
  assert.equal(evaluateTutorialCheck(game,step('place-unit'),'indoorCoolingUnit'),true);
  build.select('demolish');build.place(30,30);
  build.select('coolingUnit');assert.ok(build.place(4,18).ok);
  assert.equal(passes('place-unit'),true);
  build.select('duct');
  build.placeDuctPath([{x:5,y:18},{x:6,y:18},{x:7,y:18}]);
  assert.equal(passes('duct'),false,'ducts still outside the room');
  build.placeDuctPath([8,9,10,11,12,13].map(x=>({x,y:18})));
  assert.equal(passes('duct'),true);
  build.select('supplyVent');build.rotation=2;assert.ok(build.place(14,18).ok);
  assert.equal(passes('vent'),false);
  assert.equal(evaluateTutorialCheck(game,step('vent'),'ventMisaimed'),true);
  build.select('demolish');build.place(14,18);
  build.select('supplyVent');build.rotation=0;assert.ok(build.place(14,18).ok);
  assert.equal(passes('vent'),true);
  build.select('fan');for(const x of [18,30])build.place(x,18);
  assert.equal(passes('fans'),false);
  build.place(42,18);assert.equal(passes('fans'),true);
  build.select('exhaust');build.rotation=0;build.place(54,17);
  assert.equal(passes('exhausts'),false);
  build.place(54,19);assert.equal(passes('exhausts'),true);
  game.renderer.mode='thermal';assert.equal(passes('start'),false,'still planning');
  sim.startOperation();assert.equal(passes('start'),true);
  assert.ok(world.entitiesByType('fan').length===3);
});

test('the tutorial does not get stuck when a step is completed between two frames',()=>{
  const game=setup(),{build}=game,steps=level01.tutorial.steps;
  assert.equal(nextTutorialIndex(game,steps,0),0);
  build.select('coolingUnit');build.place(3,19);build.select('duct');
  assert.equal(steps[nextTutorialIndex(game,steps,0)].id,'duct','unit placed although the tool is no longer selected');
  build.placeDuctPath([4,5,6,7,8,9,10,11,12,13].map(x=>({x,y:19})));
  build.select('supplyVent');build.place(14,19);
  assert.equal(steps[nextTutorialIndex(game,steps,0)].id,'fans');
});

test('air reach preview widens, stops at walls and reports the machines it hits',()=>{
  const world=new World(20,9);
  for(let y=0;y<9;y++)world.setMaterial(12,y,'concrete');
  const machine=world.addEntity(new Machine(6,4,{}));
  const reach=airReachCells(world,{x:2,y:4,direction:{x:1,y:0}},{range:14,spread:.3});
  assert.equal(reach.length,9);assert.deepEqual(reach.blockedAt,{x:12,y:4});
  assert.ok(reach.cells.every(cell=>cell.x<12));
  assert.ok(reach.cells.some(cell=>cell.y!==4),'jet widens with distance');
  assert.deepEqual(reach.hits,[machine]);
  const near=reach.cells.find(cell=>cell.x===3&&cell.y===4),far=reach.cells.find(cell=>cell.x===11&&cell.y===4);
  assert.ok(near.strength>far.strength);
  const intake=previewAirReach(world,'exhaust',{x:8,y:4,direction:{x:1,y:0}});
  assert.ok(intake.cells.every(cell=>cell.x<8),'exhaust shows the area it pulls air from');
  assert.equal(previewAirReach(world,'wall',{x:1,y:1,direction:{x:1,y:0}}),null);
});
