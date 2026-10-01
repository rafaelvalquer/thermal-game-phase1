import { clamp } from '../utils/MathUtils.js';

export class Camera {
  constructor(){this.x=0;this.y=0;this.zoom=1;this.minZoom=.35;this.maxZoom=2.4;this.bounds=null;}
  setBounds(bounds,height){this.bounds=typeof bounds==='number'?{x:0,y:0,width:bounds,height}: {x:bounds.x||0,y:bounds.y||0,width:bounds.width,height:bounds.height};}
  move(dx,dy){this.x+=dx/this.zoom;this.y+=dy/this.zoom;}
  zoomAt(factor,screenX,screenY){
    const old=this.zoom,next=clamp(old*factor,this.minZoom,this.maxZoom);if(next===old)return;
    const wx=(screenX/old)+this.x,wy=(screenY/old)+this.y;this.zoom=next;this.x=wx-screenX/next;this.y=wy-screenY/next;
  }
  constrain(viewportWidth,viewportHeight){
    if(!this.bounds)return;
    const visibleW=viewportWidth/this.zoom,visibleH=viewportHeight/this.zoom;
    const {x,y,width,height}=this.bounds;
    this.x=visibleW>=width?x+(width-visibleW)/2:clamp(this.x,x,x+width-visibleW);
    this.y=visibleH>=height?y+(height-visibleH)/2:clamp(this.y,y,y+height-visibleH);
  }
  worldToScreen(x,y){return{x:(x-this.x)*this.zoom,y:(y-this.y)*this.zoom};}
  screenToWorld(x,y){return{x:x/this.zoom+this.x,y:y/this.zoom+this.y};}
}
