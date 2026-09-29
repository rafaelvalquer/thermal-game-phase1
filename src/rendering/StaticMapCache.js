function defaultCanvasFactory(width,height){
  if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(width,height);
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;}
  return null;
}

export class StaticMapCache {
  constructor({canvasFactory=defaultCanvasFactory}={}){this.canvasFactory=canvasFactory;this.canvas=null;this.version=-1;this.width=0;this.height=0;this.tile=0;this.zones=null;this.rebuildCount=0;}
  draw(ctx,world,tile,zones,tileRenderer,bounds=null){
    if(!this.ensure(world,tile,zones,tileRenderer))return tileRenderer.draw(ctx,world,tile,zones,'normal',bounds);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(this.canvas,0,0);
  }
  ensure(world,tile,zones,tileRenderer){
    const width=world.width*tile,height=world.height*tile;
    if(this.canvas&&this.version===world.materialTopologyVersion&&this.width===width&&this.height===height&&this.tile===tile&&this.zones===zones)return true;
    const canvas=this.canvasFactory(width,height);if(!canvas)return false;
    canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');if(!context)return false;
    context.setTransform?.(1,0,0,1,0,0);context.clearRect?.(0,0,width,height);context.imageSmoothingEnabled=false;
    tileRenderer.draw(context,world,tile,zones,'normal',{x:0,y:0,width,height});
    this.canvas=canvas;this.version=world.materialTopologyVersion;this.width=width;this.height=height;this.tile=tile;this.zones=zones;this.rebuildCount++;
    return true;
  }
}
