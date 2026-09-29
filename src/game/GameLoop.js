import { FIXED_DT } from '../utils/Constants.js';
export class GameLoop {
  constructor(update,render,{monitor=null}={}){this.update=update;this.render=render;this.monitor=monitor;this.acc=0;this.last=0;this.running=false;}
  start(){this.running=true;requestAnimationFrame(t=>this.frame(t));}
  stop(){this.running=false;this.last=0;this.acc=0;this.monitor?.dispose?.();}
  frame(t){
    if(!this.running)return;
    if(!this.last)this.last=t;
    const dt=Math.min(.1,(t-this.last)/1000);this.last=t;this.acc+=dt;
    this.monitor?.begin('gameLoopWorkMs');
    let updates=0;
    try{
      this.monitor?.begin('gameLoopUpdateMs');
      while(this.acc>=FIXED_DT){this.update(FIXED_DT);this.acc-=FIXED_DT;updates++;}
      this.monitor?.end('gameLoopUpdateMs');
      this.monitor?.count('gameLoopUpdates',updates);
      this.render();
    }finally{
      this.monitor?.end('gameLoopWorkMs');
      this.monitor?.endFrame(t);
    }
    requestAnimationFrame(n=>this.frame(n));
  }
}
