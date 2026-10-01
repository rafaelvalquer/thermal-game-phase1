export const ENVIRONMENT_CELL={SOLID:1,EXTERIOR:2,INTERIOR:3};

/** Shared physical classification of map cells. Open space reaches the exterior
 * when it is connected to any map edge through other open cells. */
export class EnvironmentTopology {
  constructor(world){
    this.world=world;this.size=world.size;
    this.classification=new Uint8Array(this.size);
    this.solidMask=new Uint8Array(this.size);
    this.exteriorMask=new Uint8Array(this.size);
    this.interiorMask=new Uint8Array(this.size);
    this.exteriorIndices=new Int32Array(this.size);this.interiorIndices=new Int32Array(this.size);
    this.exteriorCount=0;this.interiorCount=0;this.sourceVersion=-1;this.revision=0;
  }

  ensureCurrent(force=false){
    const version=this.world.environmentTopologyVersion??this.world.airTopologyVersion??0;
    if(!force&&version===this.sourceVersion)return false;
    this.rebuild();this.sourceVersion=version;this.revision++;
    return true;
  }

  rebuild(){
    const world=this.world,{width,height,size}=world;
    this.classification.fill(0);this.solidMask.fill(0);this.exteriorMask.fill(0);this.interiorMask.fill(0);
    for(let index=0;index<size;index++){
      if(world.airMaterial[index]!==1){this.solidMask[index]=1;this.classification[index]=ENVIRONMENT_CELL.SOLID;}
    }
    const queue=new Int32Array(size);let head=0,tail=0;
    const add=(index)=>{
      if(index<0||index>=size||this.solidMask[index]||this.exteriorMask[index])return;
      this.exteriorMask[index]=1;this.classification[index]=ENVIRONMENT_CELL.EXTERIOR;queue[tail++]=index;
    };
    for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
    for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
    while(head<tail){
      const index=queue[head++],x=index%width,y=(index/width)|0;
      if(x>0)add(index-1);if(x+1<width)add(index+1);
      if(y>0)add(index-width);if(y+1<height)add(index+width);
    }
    this.exteriorCount=tail;let interiorCount=0;
    for(let index=0;index<size;index++)if(!this.solidMask[index]&&!this.exteriorMask[index]){
      this.interiorMask[index]=1;this.classification[index]=ENVIRONMENT_CELL.INTERIOR;
      this.interiorIndices[interiorCount++]=index;
    }
    this.interiorCount=interiorCount;
    this.exteriorIndices.set(queue.subarray(0,tail));
  }

  indexAt(x,y){return this.world.inBounds(x,y)?this.world.index(x,y):-1;}
  isSolid(x,y){this.ensureCurrent();const index=this.indexAt(x,y);return index<0||this.solidMask[index]===1;}
  isExterior(x,y){this.ensureCurrent();const index=this.indexAt(x,y);return index>=0&&this.exteriorMask[index]===1;}
  isInterior(x,y){this.ensureCurrent();const index=this.indexAt(x,y);return index>=0&&this.interiorMask[index]===1;}
  at(x,y){this.ensureCurrent();const index=this.indexAt(x,y);return index<0?ENVIRONMENT_CELL.SOLID:this.classification[index];}
}
