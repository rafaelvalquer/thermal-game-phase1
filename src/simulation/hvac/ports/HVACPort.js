export class HVACPort {
  constructor({entity,type,x,y,dx,dy,color}){
    Object.assign(this,{entity,type,x,y,dx,dy,color});
    this.id=`${entity.id}:port:${type}`;
  }
  get cell(){return {x:this.x+this.dx,y:this.y+this.dy};}
}
