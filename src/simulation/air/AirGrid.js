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
    this.pressure=new Float32Array(this.size+1);
    this.pressureNext=new Float32Array(this.size+1);
    this.divergence=new Float32Array(this.size);
    this.solid=new Uint8Array(this.size);
    this.exteriorCells=new Uint8Array(this.size);
    this.hasExteriorCells=false;
    this.pressureLeft=new Int32Array(this.size);this.pressureRight=new Int32Array(this.size);this.pressureUp=new Int32Array(this.size);this.pressureDown=new Int32Array(this.size);this.pressureNeighborCount=new Uint8Array(this.size);
    this.pressureCells=new Int32Array(this.size);this.pressureCellCount=0;
    this.projectionPressureCells=new Int32Array(this.size);this.projectionPressureCellCount=0;
    this.interiorPressureCells=new Int32Array(this.size);this.interiorPressureCellCount=0;
    this.wallProximity=new Uint8Array(this.size);
    this.wallConfinement=new Uint8Array(this.size);
    this.topologyVersion=-1;
    this.environmentVersion=-1;

    world.airPressure=this.pressure;
    world.airDivergence=this.divergence;
    world.airWallProximity=this.wallProximity;
    world.airWallConfinement=this.wallConfinement;
  }

  cellIndex(x,y){return y*this.width+x;}
  uIndex(x,y){return y*(this.width+1)+x;}
  vIndex(x,y){return y*this.width+x;}
  inCell(x,y){return x>=0&&y>=0&&x<this.width&&y<this.height;}
  isSolid(x,y){return !this.inCell(x,y)||this.solid[this.cellIndex(x,y)]===1;}
  isAir(x,y){return this.inCell(x,y)&&!this.isSolid(x,y);}

  syncTopology(force=false){
    const version=this.world.airTopologyVersion??0;
    const environmentVersion=this.world.environmentTopologyVersion??version;
    if(!force&&version===this.topologyVersion&&environmentVersion===this.environmentVersion)return false;
    this.topologyVersion=version;this.environmentVersion=environmentVersion;
    this.pressure.fill(0);this.pressureNext.fill(0);this.u.fill(0);this.v.fill(0);
    this.world.environmentTopology?.ensureCurrent();
    if(this.world.environmentTopology){this.solid.set(this.world.environmentTopology.solidMask);this.exteriorCells.set(this.world.environmentTopology.exteriorMask);}
    else for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){const i=this.cellIndex(x,y);this.solid[i]=this.world.registry.fromIndex(this.world.material[i]).solid?1:0;}
    this.buildExteriorMask();

    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
      const i=this.cellIndex(x,y);
      if(this.solid[i]){
        this.wallProximity[i]=4;
        this.wallConfinement[i]=3;
        continue;
      }

      let near=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;
        const nx=x+dx,ny=y+dy;
        if(this.inCell(nx,ny)&&this.solid[this.cellIndex(nx,ny)])near++;
      }
      this.wallProximity[i]=near;

      let nearest=4;
      for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
        if(!dx&&!dy)continue;
        const distance=Math.max(Math.abs(dx),Math.abs(dy));
        if(distance>=nearest)continue;
        const nx=x+dx,ny=y+dy;
        if(this.inCell(nx,ny)&&this.solid[this.cellIndex(nx,ny)])nearest=distance;
      }
      this.wallConfinement[i]=nearest<4?4-nearest:0;
    }
    this.buildPressureStencil();
    return true;
  }

  buildExteriorMask(){
    if(this.world.environmentTopology){this.world.environmentTopology.ensureCurrent();this.exteriorCells.set(this.world.environmentTopology.exteriorMask);}
    this.hasExteriorCells=this.exteriorCells.some(value=>value===1);
  }

  buildPressureStencil(){
    const {width,height,solid,exteriorCells,pressureLeft:left,pressureRight:right,pressureUp:up,pressureDown:down,pressureNeighborCount:counts,pressureCells,projectionPressureCells,interiorPressureCells}=this;
    const zero=this.size;left.fill(zero);right.fill(zero);up.fill(zero);down.fill(zero);counts.fill(0);
    let pressureCellCount=0,projectionPressureCellCount=0,interiorPressureCellCount=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(solid[i])continue;
      pressureCells[pressureCellCount++]=i;projectionPressureCells[projectionPressureCellCount++]=i;
      if(!exteriorCells[i])interiorPressureCells[interiorPressureCellCount++]=i;
      let count=0;
      if(x===0)count++;else if(!solid[i-1]){left[i]=i-1;count++;}
      if(x===width-1)count++;else if(!solid[i+1]){right[i]=i+1;count++;}
      if(y===0)count++;else if(!solid[i-width]){up[i]=i-width;count++;}
      if(y===height-1)count++;else if(!solid[i+width]){down[i]=i+width;count++;}
      counts[i]=count;
    }
    this.pressureCellCount=pressureCellCount;
    this.projectionPressureCellCount=projectionPressureCellCount;
    this.interiorPressureCellCount=interiorPressureCellCount;
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

  syncWorldVelocity(diagnostics=null){
    const w=this.world;
    let maxVelocity=0,sumVelocity=0,count=0,maxPressure=-Infinity,minPressure=Infinity,maxDivergence=0;
    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){
      const i=this.cellIndex(x,y);
      if(this.solid[i]){w.airX[i]=0;w.airY[i]=0;continue;}
      const vx=.5*(this.u[this.uIndex(x,y)]+this.u[this.uIndex(x+1,y)]),vy=.5*(this.v[this.vIndex(x,y)]+this.v[this.vIndex(x,y+1)]);
      w.airX[i]=vx;w.airY[i]=vy;
      if(diagnostics){const speed=Math.hypot(vx,vy);maxVelocity=Math.max(maxVelocity,speed);sumVelocity+=speed;count++;maxPressure=Math.max(maxPressure,this.pressure[i]);minPressure=Math.min(minPressure,this.pressure[i]);maxDivergence=Math.max(maxDivergence,Math.abs(this.divergence[i]));}
    }
    if(!diagnostics)return null;
    return {maxVelocity,averageVelocity:count?sumVelocity/count:0,maxPressure:Number.isFinite(maxPressure)?maxPressure:0,minPressure:Number.isFinite(minPressure)?minPressure:0,maxDivergence};
  }
}
