export class AirBoundarySystem {
  constructor(grid){this.grid=grid;}

  enforce(){
    const g=this.grid,w=g.width,h=g.height;

    for(let y=0;y<h;y++)for(let x=0;x<=w;x++){
      const i=g.uIndex(x,y);
      if(g.blockedU(x,y)){g.u[i]=0;continue;}
      if(x===0&&w>1)g.u[i]=g.u[g.uIndex(1,y)];
      else if(x===w&&w>1)g.u[i]=g.u[g.uIndex(w-1,y)];
    }

    for(let y=0;y<=h;y++)for(let x=0;x<w;x++){
      const i=g.vIndex(x,y);
      if(g.blockedV(x,y)){g.v[i]=0;continue;}
      if(y===0&&h>1)g.v[i]=g.v[g.vIndex(x,1)];
      else if(y===h&&h>1)g.v[i]=g.v[g.vIndex(x,h-1)];
    }
  }
}
