const INTAKE_DIRECTIONS=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];

export class VentCoverageCache {
  constructor(world,{maxEntries=512,monitor=null}={}){
    this.world=world;this.maxEntries=maxEntries;this.monitor=monitor;
    this.entries=new Map();this.geometryCalculations=0;this.hits=0;
  }

  signature(vent,radius){
    const direction=vent.direction||{x:0,y:1};
    return [vent.id,vent.x,vent.y,direction.x,direction.y,radius,this.world.airTopologyVersion||0,this.world.rackTopologyVersion||0].join(':');
  }

  get(vent,radius=3){
    const signature=this.signature(vent,radius),cached=this.entries.get(vent);
    if(cached?.signature===signature){
      this.entries.delete(vent);this.entries.set(vent,cached);this.hits++;
      this.monitor?.count('ventCoverageCacheHitCount');
      return cached.geometry;
    }
    this.monitor?.begin?.('ventCoverageMs');
    let geometry;
    try{geometry=this.build(vent,radius);}finally{this.monitor?.end?.('ventCoverageMs');}
    this.entries.delete(vent);this.entries.set(vent,{signature,geometry});
    while(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value);
    this.geometryCalculations++;this.monitor?.count('ventCoverageCalculationCount');
    return geometry;
  }

  build(vent,radius){
    const world=this.world;
    const returnAirStencil=[];
    if(world.inBounds(vent.x,vent.y))for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const x=vent.x+dx,y=vent.y+dy;if(!world.inBounds(x,y)||!world.isAir(x,y))continue;
      returnAirStencil.push({index:world.index(x,y),weight:1/(1+Math.hypot(dx,dy))});
    }
    if(!world.inBounds(vent.x,vent.y)||!world.isAir(vent.x,vent.y))return {cells:[],rackCandidates:[],returnAirStencil};
    const direction=vent.direction||{x:0,y:1},queue=[{x:vent.x,y:vent.y,distance:0}],seen=new Set([world.index(vent.x,vent.y)]),cells=[];
    for(let head=0;head<queue.length;head++){
      const cell=queue[head],dx=cell.x-vent.x,dy=cell.y-vent.y,forward=dx*direction.x+dy*direction.y;
      const lateral=Math.abs(dx*direction.y-dy*direction.x);
      if(forward>=0&&lateral<=1&&forward<=radius){
        const distance=Math.hypot(dx,dy),staticWeight=(1+.5*forward/Math.max(distance,1))/(1+distance);
        cells.push({x:cell.x,y:cell.y,index:world.index(cell.x,cell.y),distance,forward,lateral,staticWeight});
      }else continue;
      if(cell.distance>=radius)continue;
      for(const [sx,sy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=cell.x+sx,y=cell.y+sy,ndx=x-vent.x,ndy=y-vent.y,nf=ndx*direction.x+ndy*direction.y,nl=Math.abs(ndx*direction.y-ndy*direction.x);
        if(nf<0||nf>radius||nl>1||!world.inBounds(x,y)||!world.isAir(x,y))continue;
        const index=world.index(x,y);if(seen.has(index))continue;seen.add(index);queue.push({x,y,distance:cell.distance+1});
      }
    }

    const candidates=new Map();
    for(const cell of cells)for(const intakeDirection of INTAKE_DIRECTIONS){
      const rack=world.entityAt(cell.x-intakeDirection.x,cell.y-intakeDirection.y);
      if(rack?.type!=='serverRack'&&rack?.type!=='computeRack')continue;
      const intake=rack.airIntakeDirection||{x:0,y:-1};
      if(intake.x!==intakeDirection.x||intake.y!==intakeDirection.y||candidates.has(rack))continue;
      const forward=cell.forward,lateral=cell.lateral;
      if(forward<1||forward>radius||lateral>1)continue;
      candidates.set(rack,{rack,rackId:rack.id,inletIndex:cell.index,x:cell.x,y:cell.y,distance:forward+lateral*.35});
    }
    return {cells,rackCandidates:[...candidates.values()],returnAirStencil};
  }
}
