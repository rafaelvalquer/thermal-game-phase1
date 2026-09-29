const now=()=>globalThis.performance?.now?.()??Date.now();

const TIME_KEYS=['simulationMs','airflowMs','pressureMs','coolingMs','coolingPrepareMs','coolingExchangeMs','ventCoverageMs','technicianDispatchMs','technicianPathfindingMs','thermalMs','thermalConductMs','rackMs','fluidMs','hydraulicSolveMs','powerSnapshotMs','renderMs','uiMs','uiGraphMs','saveMs'];
const COUNT_KEYS=['pressureSolveCount','coolingRebuildCount','coolingPrepareCount','coolingFrameReuseCount','coolingPartialRecalcCount','ventCoverageCalculationCount','ventCoverageCacheHitCount','technicianDispatchCount','technicianPathCalculationCount','pathsCalculated','technicianPathCacheHitCount','fluidRebuildCount','hydraulicSolveCount','thermalTopologyRebuildCount'];

export class PerformanceMonitor {
  constructor({windowSize=120,clock=now}={}){
    this.windowSize=windowSize;this.clock=clock;this.frames=[];this.current={times:{},counts:{},values:{}};this.lastValues={};this.started=new Map();this.lastFrameAt=this.clock();
  }
  begin(name){const stack=this.started.get(name)||[];stack.push(this.clock());this.started.set(name,stack);}
  end(name){const stack=this.started.get(name);if(!stack?.length)return 0;const elapsed=Math.max(0,this.clock()-stack.pop());if(!stack.length)this.started.delete(name);this.current.times[name]=(this.current.times[name]||0)+elapsed;return elapsed;}
  measure(name,callback){this.begin(name);try{return callback();}finally{this.end(name);}}
  count(name,amount=1){this.current.counts[name]=(this.current.counts[name]||0)+amount;}
  set(name,value){this.current.values[name]=value;}
  endFrame(timestamp=this.clock()){
    const frameTime=Math.max(0,timestamp-this.lastFrameAt);this.lastFrameAt=timestamp;
    Object.assign(this.lastValues,this.current.values);
    this.frames.push({times:this.current.times,counts:this.current.counts,values:{...this.lastValues},frameTime});
    if(this.frames.length>this.windowSize)this.frames.shift();
    this.current={times:{},counts:{},values:{}};
  }
  snapshot(){
    const frames=this.frames,count=frames.length,totalMs=frames.reduce((sum,frame)=>sum+frame.frameTime,0),result={fps:totalMs?1000*count/totalMs:0,frameTime:count?totalMs/count:0};
    for(const key of TIME_KEYS)result[key]=count?frames.reduce((sum,frame)=>sum+(frame.times[key]||0),0)/count:0;
    for(const key of COUNT_KEYS)result[key]=totalMs?frames.reduce((sum,frame)=>sum+(frame.counts[key]||0),0)*1000/totalMs:0;
    result.visibleEntities=frames.length?(frames.at(-1).values.visibleEntities||0):0;
    result.totalEntities=frames.length?(frames.at(-1).values.totalEntities||0):0;
    result.saveBytes=frames.length?(frames.at(-1).values.saveBytes||0):0;
    return result;
  }
}
