import { clamp } from '../utils/MathUtils.js';
export class Camera {
  constructor(){this.x=0;this.y=0;this.zoom=1;this.minZoom=.45;this.maxZoom=2.4;}
  move(dx,dy){this.x+=dx/this.zoom;this.y+=dy/this.zoom;}
  zoomAt(factor,screenX,screenY){const old=this.zoom;const next=clamp(old*factor,this.minZoom,this.maxZoom);if(next===old)return;const wx=(screenX/old)+this.x,wy=(screenY/old)+this.y;this.zoom=next;this.x=wx-screenX/next;this.y=wy-screenY/next;}
  worldToScreen(x,y){return{x:(x-this.x)*this.zoom,y:(y-this.y)*this.zoom};}
  screenToWorld(x,y){return{x:x/this.zoom+this.x,y:y/this.zoom+this.y};}
}
