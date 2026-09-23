import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../../../src/world/World.js';
import { Fan } from '../../../src/entities/Fan.js';
import { StreamlineGenerator } from '../../../src/rendering/air/StreamlineGenerator.js';
import { StreamlineSeeder } from '../../../src/rendering/air/StreamlineSeeder.js';

const uniform=(world,vx,vy)=>{
  world.airX.fill(vx);
  world.airY.fill(vy);
};

test('straight flow produces a continuous streamline along X',()=>{
  const world=new World(14,8);uniform(world,1,0);
  const generator=new StreamlineGenerator({step:.25,maxPoints:60});
  const line=generator.generate(world,{x:2.5,y:4.5});
  assert.ok(line&&line.points.length>8);
  const first=line.points[0],last=line.points.at(-1);
  assert.ok(last.x>first.x);
  assert.ok(Math.abs(last.y-first.y)<.2);
});

test('streamline never crosses a solid wall',()=>{
  const world=new World(14,8);uniform(world,1,0);
  for(let y=0;y<world.height;y++)world.setMaterial(8,y,'concrete');
  const generator=new StreamlineGenerator({step:.22,maxPoints:100});
  const forward=generator.integrateForward(world,{x:2.5,y:4.5});
  assert.ok(forward.points.length>3);
  assert.ok(forward.points.every(p=>p.x<8));
});

test('streamline follows a 90 degree velocity bend',()=>{
  const world=new World(14,12);
  for(let y=0;y<world.height;y++)for(let x=0;x<world.width;x++){
    const i=world.index(x,y);
    if(x<7){world.airX[i]=1;world.airY[i]=0;}
    else{world.airX[i]=0;world.airY[i]=1;}
  }
  const generator=new StreamlineGenerator({step:.2,maxPoints:100});
  const forward=generator.integrateForward(world,{x:2.5,y:3.5});
  assert.ok(forward.points.some(p=>p.x>7&&p.y>4.2));
});

test('dead air does not generate false streamlines',()=>{
  const world=new World(10,8);
  const generator=new StreamlineGenerator();
  assert.equal(generator.generate(world,{x:4.5,y:4.5}),null);
});

test('closed circular field is detected as recirculation loop',()=>{
  const world=new World(14,14);
  const generator=new StreamlineGenerator({step:.18,maxPoints:180,loopDistance:.32,loopLookback:18});
  generator.sampleVelocity=(w,x,y)=>{
    const dx=x-7,dy=y-7,vx=-dy,vy=dx,speed=Math.hypot(vx,vy);
    return {x:vx,y:vy,speed};
  };
  const forward=generator.integrateForward(world,{x:9.5,y:7});
  assert.equal(forward.loop,true);
});

test('fan seeds are placed in the airflow direction',()=>{
  const world=new World(12,8);uniform(world,1,0);
  const fan=new Fan(2,4,{x:1,y:0});world.addEntity(fan);
  const seeder=new StreamlineSeeder({gridStep:20});
  const seeds=seeder.generate(world,1);
  assert.ok(seeds.length>0);
  assert.ok(seeds.slice(0,3).every(s=>s.x>fan.x+.5));
});
