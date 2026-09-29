const CARDINALS=[[1,0],[-1,0],[0,1],[0,-1]];

export class ExchangerTargetCache {
  constructor(world){this.world=world;this.machineVersion=-1;this.targets=new Map();this.rebuildCount=0;}

  adjacentMachines(exchanger){
    const version=this.world.heatMachineTopologyVersion??0;
    if(version!==this.machineVersion){this.targets.clear();this.machineVersion=version;}
    const cached=this.targets.get(exchanger.id);
    if(cached?.x===exchanger.x&&cached?.y===exchanger.y)return cached.machines;
    const machines=[];
    for(const [dx,dy] of CARDINALS){const candidate=this.world.entityAt(exchanger.x+dx,exchanger.y+dy);if(candidate?.isHeatMachine)machines.push(candidate);}
    this.targets.set(exchanger.id,{x:exchanger.x,y:exchanger.y,machines});this.rebuildCount++;
    return machines;
  }
}
