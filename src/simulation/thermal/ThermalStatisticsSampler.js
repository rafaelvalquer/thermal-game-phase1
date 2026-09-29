export class ThermalStatisticsSampler {
  constructor(world,metrics,{monitor=null}={}){this.world=world;this.metrics=metrics;this.monitor=monitor;this.topologyVersion=-1;this.airIndices=new Int32Array(0);this.rebuildCount=0;}

  rebuild(){
    const world=this.world;let count=0;for(let i=0;i<world.size;i++)if(world.isAirIndex(i))count++;
    this.airIndices=new Int32Array(count);let cursor=0;for(let i=0;i<world.size;i++)if(world.isAirIndex(i))this.airIndices[cursor++]=i;
    this.topologyVersion=world.thermalStatisticsVersion;this.rebuildCount++;this.monitor?.count?.('thermalStatisticsRebuildCount');
  }

  sample(){
    this.monitor?.begin?.('thermalStatsMs');
    try{
      if(this.topologyVersion!==this.world.thermalStatisticsVersion)this.rebuild();
      let sum=0,max=-Infinity;for(const index of this.airIndices){const temperature=this.world.temperatureAtIndex(index);sum+=temperature;max=Math.max(max,temperature);}
      const count=this.airIndices.length;this.metrics.airTemperatureSum=sum;this.metrics.maxAirTemp=count?max:0;this.metrics.airCellCount=count;
      return {sum,max:count?max:0,count};
    }finally{this.monitor?.end?.('thermalStatsMs');}
  }
}
