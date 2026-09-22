import { AIR } from './AirConstants.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class AirGrid {
  constructor(world){
    this.world=world;
    this.width=world.width;
    this.height=world.height;
    this.size=world.size;
    this.dx=AIR.cellSize;

    this.u=new Float32Array((this.width+1)*this.height);
    this.v=new Float32Array(this.width*(this.height+1));
    this.uNext=new Float32Array(this.u.length);
    this.vNext=new Float32Array(this.v.length);
    this.pressure=new Float32Array(this.size);
    this.pressureNext=new Float32Array(this.size);
    this.divergence=new Float32Array(this.size);
    this.solid=new Uint8Array(this.size);
    this.wallProximity=new Uint8Array(this.size);
    this.topologyVersion=-1;

    world.airPressure=this.pressure;
    world.airDivergence=this.divergence;
    world.airWallProximity=this.wallProximity;
  }

  cellIndex(x,y){return y*this.width+x;}
  uIndex(x,y){return y*(this.width+1)+x;}
  vIndex(x,y){return y*this.width+x;}
  inCell(x,y){return x>=0&&y>=0&&x<this.width&&y<this.height;}
  isSolid(x,y){return !this.inCell(x,y)||this.solid[this.cellIndex(x,y)]===1;}
  isAir(x,y){return this.inCell(x,y)&&!this.isSolid(x,y);}

  syncTopology(force=false){
    const version=this.world.airTopologyVersion??0;
    if(!force&&version===this.topologyVersion)return false;
    this.topologyVersion=version;
    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
      const i=this.cellIndex(x,y);
      this.solid[i]=this.world.registry.fromIndex(this.world.material[i]).solid?1:0;
    }
    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
      const i=this.cellIndex(x,y);
      if(this.solid[i]){this.wallProximity[i]=4;continue;}
      let near=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;
        if(this.inCell(nx,ny)&&this.solid[this.cellIndex(nx,ny)])near++;
      }
      this.wallProximity[i]=near;
    }
    return true;
  }

  cellVelocity(x,y){
    if(!this.isAir(x,y))return {x:0,y:0};
    return {
      x:.5*(this.u[this.uIndex(x,y)]+this.u[this.uIndex(x+1,y)]),
      y:.5*(this.v[this.vIndex(x,y)]+this.v[this.vIndex(x,y+1)]),
    };
  }

  sampleU(px,py){
    const fx=px/this.dx;
    const fy=py/this.dx-.5;
    return this.sampleField(this.u,this.width+1,this.height,fx,fy);
  }

  sampleV(px,py){
    const fx=px/this.dx-.5;
    const fy=py/this.dx;
    return this.sampleField(this.v,this.width,this.height+1,fx,fy);
  }

  sampleVelocity(px,py){return {x:this.sampleU(px,py),y:this.sampleV(px,py)};}

  sampleField(field,w,h,fx,fy){
    const x0=clamp(Math.floor(fx),0,w-1),y0=clamp(Math.floor(fy),0,h-1);
    const x1=clamp(x0+1,0,w-1),y1=clamp(y0+1,0,h-1);
    const tx=clamp(fx-x0,0,1),ty=clamp(fy-y0,0,1);
    const a=field[y0*w+x0]*(1-tx)+field[y0*w+x1]*tx;
    const b=field[y1*w+x0]*(1-tx)+field[y1*w+x1]*tx;
    return a*(1-ty)+b*ty;
  }

  blockedU(x,y){
    const left=x-1,right=x;
    if(x===0)return this.isSolid(0,y);
    if(x===this.width)return this.isSolid(this.width-1,y);
    return this.isSolid(left,y)||this.isSolid(right,y);
  }

  blockedV(x,y){
    const top=y-1,bottom=y;
    if(y===0)return this.isSolid(x,0);
    if(y===this.height)return this.isSolid(x,this.height-1);
    return this.isSolid(x,top)||this.isSolid(x,bottom);
  }

  syncWorldVelocity(){
    const w=this.world;
    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
      const i=this.cellIndex(x,y);
      if(this.solid[i]){w.airX[i]=0;w.airY[i]=0;continue;}
      w.airX[i]=.5*(this.u[this.uIndex(x,y)]+this.u[this.uIndex(x+1,y)]);
      w.airY[i]=.5*(this.v[this.vIndex(x,y)]+this.v[this.vIndex(x,y+1)]);
    }
  }
}
