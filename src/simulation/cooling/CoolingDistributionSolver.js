export class CoolingDistributionSolver {
  solve(network,maxAirFlow){
    if(network.status!=='READY'||!network.paths.length)return [];
    return this.solvePaths(network.paths,maxAirFlow);
  }

  solvePaths(paths,maxAirFlow){
    if(!paths.length)return paths;
    let sum=0;
    for(const path of paths){path.dynamicWeight=Math.max(0,path.vent.flowMode==='auto'?(path.autoWeight??1):(path.vent.flowWeight??1));sum+=path.dynamicWeight;}
    sum=sum||paths.length;
    for(const path of paths)path.flowRate=maxAirFlow*(path.dynamicWeight||1)/sum*path.efficiency;
    return paths;
  }
}
