export class ThermalDistortionBuffer {
  constructor(){
    this.canvas=null;
    this.ctx=null;
    this.width=0;
    this.height=0;
    this.dpr=1;
  }

  ensure(width,height,dpr=1){
    const pw=Math.max(1,Math.floor(width*dpr)),ph=Math.max(1,Math.floor(height*dpr));
    if(!this.canvas){
      if(typeof document==='undefined')return false;
      this.canvas=document.createElement('canvas');
      this.ctx=this.canvas.getContext('2d');
    }
    if(this.canvas.width!==pw||this.canvas.height!==ph){
      this.canvas.width=pw;this.canvas.height=ph;
    }
    this.width=width;this.height=height;this.dpr=dpr;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.ctx.clearRect(0,0,width,height);
    return true;
  }

  context(){return this.ctx;}
}
