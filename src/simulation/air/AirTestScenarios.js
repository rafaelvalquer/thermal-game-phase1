import { World } from '../../world/World.js';
import { Fan } from '../../entities/Fan.js';

const wallLine=(world,x1,y1,x2,y2)=>{
  if(x1===x2){for(let y=Math.min(y1,y2);y<=Math.max(y1,y2);y++)world.setMaterial(x1,y,'concrete');}
  else if(y1===y2){for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)world.setMaterial(x,y1,'concrete');}
};

const fan=(world,x,y,direction={x:1,y:0})=>{
  const e=new Fan(x,y,direction);world.addEntity(e);return e;
};

export const AirTestScenarios={
  openFan(){
    const world=new World(32,15),source=fan(world,4,7,{x:1,y:0});
    return {world,fan:source};
  },

  straightDuct({length=22,width=5}={}){
    const world=new World(34,17),top=6,bottom=top+width-1;
    wallLine(world,2,top,2+length,top);
    wallLine(world,2,bottom,2+length,bottom);
    const source=fan(world,4,Math.floor((top+bottom)/2),{x:1,y:0});
    return {world,fan:source,top,bottom,outletX:2+length};
  },

  narrowDuct(){return this.straightDuct({length:22,width:3});},

  deadEnd(){
    const s=this.straightDuct({length:20,width:3});
    wallLine(s.world,s.outletX,s.top,s.outletX,s.bottom);
    return s;
  },

  bend90(){
    const world=new World(30,24);
    wallLine(world,2,8,17,8);wallLine(world,2,12,13,12);
    wallLine(world,17,8,17,21);wallLine(world,13,12,13,21);
    const source=fan(world,4,10,{x:1,y:0});
    return {world,fan:source};
  },

  obstacle(){
    const s=this.straightDuct({length:22,width:7});
    s.world.setMaterial(13,8,'concrete');
    s.world.setMaterial(13,9,'concrete');
    return s;
  },

  twoFansSeries(){
    const s=this.straightDuct({length:22,width:5});
    const second=fan(s.world,10,Math.floor((s.top+s.bottom)/2),{x:1,y:0});
    return {...s,secondFan:second};
  },
};
