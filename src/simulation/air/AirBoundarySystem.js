export class AirBoundarySystem {
  constructor(grid){this.grid=grid;}

  enforce(){
    const g=this.grid,w=g.width,h=g.height;

    for(let y=0;y<h;y++)for(let x=0;x<=w;x++){
      const i=g.uIndex(x,y);
      if(g.blockedU(x,y)){g.u[i]=0;continue;}
      // Positive U points into the map at the left edge and out at the right.
      if(x===0)g.u[i]=Math.min(0,g.u[i]);
      else if(x===w)g.u[i]=Math.max(0,g.u[i]);
    }

    for(let y=0;y<=h;y++)for(let x=0;x<w;x++){
      const i=g.vIndex(x,y);
      if(g.blockedV(x,y)){g.v[i]=0;continue;}
      // Positive V points into the map at the top edge and out at the bottom.
      if(y===0)g.v[i]=Math.min(0,g.v[i]);
      else if(y===h)g.v[i]=Math.max(0,g.v[i]);
    }

    // Exterior doorways are one-way vents: air can leave the building, while
    // the ambient exterior cannot feed a reverse stream back through them.
    for(const {x,y,direction} of g.world.airExteriorOpenings||[]){
      if(direction.x){
        const face=g.uIndex(direction.x>0?x+1:x,y),outward=g.u[face]*direction.x;
        if(outward<0)g.u[face]=0;
      }else{
        const face=g.vIndex(x,direction.y>0?y+1:y),outward=g.v[face]*direction.y;
        if(outward<0)g.v[face]=0;
      }
    }
  }
}
