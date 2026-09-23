import { SPRITES } from './SpriteManifest.js';
import { SpriteAtlas } from './SpriteAtlas.js';

export class SpriteManager {
  constructor({definitions=SPRITES,ImageClass=globalThis.Image}={}){
    this.atlas=new SpriteAtlas(definitions);this.ImageClass=ImageClass;this.images=new Map();this.failed=new Set();this.ready=false;
  }
  async loadAll(){
    if(!this.ImageClass){this.ready=true;return {loaded:0,failed:Object.keys(this.atlas.definitions).length};}
    const results=await Promise.all(Object.values(this.atlas.definitions).map(definition=>this.load(definition).catch(()=>{this.failed.add(definition.id);return false;})));
    this.ready=true;return {loaded:results.filter(Boolean).length,failed:results.filter(result=>!result).length};
  }
  load(definition){
    if(this.images.has(definition.id))return Promise.resolve(true);
    if(this.failed.has(definition.id))return Promise.resolve(false);
    return new Promise(resolve=>{
      const image=new this.ImageClass();let settled=false;
      const finish=ok=>{
        if(settled)return;settled=true;
        const dimensionsValid=Number(image.naturalWidth||image.width)>=definition.frameWidth*definition.frames&&
          Number(image.naturalHeight||image.height)>=definition.frameHeight;
        if(ok&&dimensionsValid)this.images.set(definition.id,image);
        else{this.failed.add(definition.id);ok=false;}
        resolve(ok);
      };
      image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=definition.path;
      if(image.complete&&image.naturalWidth>0)finish(true);
    });
  }
  get(id){return this.images.get(id)||null;}
  draw(ctx,id,frame,x,y,width,height){
    const image=this.get(id),rect=this.atlas.sourceRect(id,frame);if(!image||!rect)return false;
    ctx.drawImage(image,rect.x,rect.y,rect.width,rect.height,x,y,width,height);return true;
  }
  get stats(){return {loaded:this.images.size,failed:this.failed.size,available:Object.keys(this.atlas.definitions).length};}
}
