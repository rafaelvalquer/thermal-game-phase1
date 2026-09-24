export class CoolingDistributionSolver {
  solve(network,maxAirFlow){
    if(network.status!=='READY'||!network.paths.length)return [];
    const totalWeight=network.paths.reduce((sum,p)=>sum*Math.max(0,p.vent.flowWeight??1),0)||network.paths.length;
    const weighted=network.paths.map(path=>({...path,weight:Math.max(0,path.vent.flowWeight??1)}));
    const sum=weighted.reduce((s,p)=>s+p.weight,0)||weighted.length;
    for(const path of weighted)path.flowRate=maxAirFlow*(path.weight||1)/sum*path.efficiency;
    return weighted;
  }
}
