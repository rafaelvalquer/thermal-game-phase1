export class PlacementValidator {
  constructor(world){this.world=world;}
  canPlace(tool,x,y){
    const w=this.world;if(!w.inBounds(x,y))return false;
    if(tool==='demolish') return Boolean(w.entityAt(x,y)) || !w.isAir(x,y);
    if(['wall','insulation','copper'].includes(tool)) return w.isAir(x,y) && !w.entityAt(x,y);
    if(!w.isAir(x,y)) return false;
    if(w.entityAt(x,y)) return false;
    return true;
  }
}
