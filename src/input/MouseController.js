export class MouseController {
  constructor(canvas,camera,tilePixels=14){this.canvas=canvas;this.camera=camera;this.tilePixels=tilePixels;this.onPrimary=()=>{};this.onSecondary=()=>{};this.onMove=()=>{};
    canvas.addEventListener('mousemove',e=>this.onMove(this.gridFromEvent(e),e));
    canvas.addEventListener('mousedown',e=>{if(e.button===0)this.onPrimary(this.gridFromEvent(e),e);if(e.button===2)this.onSecondary(this.gridFromEvent(e),e);});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();this.camera.zoomAt(e.deltaY<0?1.12:.89,e.clientX-r.left,e.clientY-r.top);},{passive:false});
  }
  gridFromEvent(e){const r=this.canvas.getBoundingClientRect();const p=this.camera.screenToWorld(e.clientX-r.left,e.clientY-r.top);return{x:Math.floor(p.x/this.tilePixels),y:Math.floor(p.y/this.tilePixels)};}
}
