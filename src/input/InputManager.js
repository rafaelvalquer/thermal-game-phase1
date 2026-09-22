export class InputManager {
  constructor(canvas){this.canvas=canvas;this.keys=new Set();this.mouse={x:0,y:0,inside:false};
    addEventListener('keydown',e=>this.keys.add(e.code));addEventListener('keyup',e=>this.keys.delete(e.code));
    canvas.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect();this.mouse.x=e.clientX-r.left;this.mouse.y=e.clientY-r.top;this.mouse.inside=true;});
    canvas.addEventListener('mouseleave',()=>this.mouse.inside=false);
  }
  down(code){return this.keys.has(code);}
}
