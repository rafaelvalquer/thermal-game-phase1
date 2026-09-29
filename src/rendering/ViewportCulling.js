export class ViewportCulling {
  constructor({minX=0,minY=0,maxX=Infinity,maxY=Infinity,margin=3}={}){
    this.minX=minX-margin;this.minY=minY-margin;this.maxX=maxX+margin;this.maxY=maxY+margin;
  }
  static fromBounds(bounds,tile,margin=3){
    if(!bounds)return new ViewportCulling();
    return new ViewportCulling({minX:Math.floor(bounds.x/tile),minY:Math.floor(bounds.y/tile),maxX:Math.ceil((bounds.x+bounds.width)/tile),maxY:Math.ceil((bounds.y+bounds.height)/tile),margin});
  }
  static fromCamera(camera,width,height,tile,{margin=3}={}){
    const topLeft=camera.screenToWorld(0,0),bottomRight=camera.screenToWorld(width,height);
    return new ViewportCulling({minX:topLeft.x/tile,minY:topLeft.y/tile,maxX:bottomRight.x/tile,maxY:bottomRight.y/tile,margin});
  }
  contains(x,y,radius=0){return x+radius>=this.minX&&y+radius>=this.minY&&x-radius<=this.maxX&&y-radius<=this.maxY;}
  tileBounds(world){return {minX:Math.max(0,Math.floor(this.minX)),minY:Math.max(0,Math.floor(this.minY)),maxX:Math.min(world.width,Math.ceil(this.maxX)),maxY:Math.min(world.height,Math.ceil(this.maxY))};}
}
