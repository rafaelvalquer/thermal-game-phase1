import { FIXED_DT } from '../utils/Constants.js';
export class GameLoop {
  constructor(update,render){this.update=update;this.render=render;this.acc=0;this.last=0;this.running=false;}
  start(){this.running=true;requestAnimationFrame(t=>this.frame(t));}
  stop(){this.running=false;this.last=0;this.acc=0;}
  frame(t){if(!this.running)return;if(!this.last)this.last=t;const dt=Math.min(.1,(t-this.last)/1000);this.last=t;this.acc+=dt;while(this.acc>=FIXED_DT){this.update(FIXED_DT);this.acc-=FIXED_DT;}this.render();requestAnimationFrame(n=>this.frame(n));}
}
