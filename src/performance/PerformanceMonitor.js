const now=()=>globalThis.performance?.now?.()??Date.now();

const TIME_KEYS=['gameLoopWorkMs','gameLoopUpdateMs','gcMs','simulationMs','airflowMs','pressureMs','coolingMs','coolingPrepareMs','coolingExchangeMs','ventCoverageMs','technicianDispatchMs','technicianPathfindingMs','thermalMs','thermalConductMs','thermalStatsMs','rackMs','fluidMs','fluidTransportMs','fluidRenderMs','energyAccountingMs','hydraulicSolveMs','powerSnapshotMs','renderMs','renderTilesMs','renderHeatmapMs','renderDuctsMs','renderEntitiesMs','renderEffectsMs','renderThermalLabelsMs','uiMs','uiGraphMs','saveMs','saveCaptureMs','saveSerializeMs','saveStorageMs'];
const COUNT_KEYS=['gameLoopUpdates','gcCount','heapDropCount','pressureSolveCount','pressureIterationsUsed','pressureEarlyExitCount','advectionSubstepsUsed','physicsSubsteps','physicsDroppedSeconds','coolingPathAllocations','coolingControlUpdates','patrolGraphRebuildCount','coolingRebuildCount','coolingPrepareCount','coolingFrameReuseCount','coolingPartialRecalcCount','ventCoverageCalculationCount','ventCoverageCacheHitCount','technicianDispatchCount','technicianPathCalculationCount','pathsCalculated','technicianPathCacheHitCount','fluidRebuildCount','hydraulicSolveCount','thermalTopologyRebuildCount','longFrameCount','severeFrameCount'];
const percentile=(values,p)=>values.length?values[Math.max(0,Math.ceil(values.length*p)-1)]:0;

export class PerformanceMonitor {
  constructor({windowSize=120,clock=now,PerformanceObserverClass=globalThis.PerformanceObserver,memoryUsage=()=>globalThis.performance?.memory?.usedJSHeapSize,memorySampleInterval=30}={}){
    this.windowSize=windowSize;this.clock=clock;this.frames=[];this.frameTimeTotal=0;this.current={times:{},counts:{},values:{}};this.lastValues={};this.started=new Map();this.lastFrameAt=this.clock();this.startedAt=this.lastFrameAt;this.saveDurations=[];this.totalSaveCount=0;
    this.memoryUsage=memoryUsage;this.memorySampleInterval=Math.max(1,memorySampleInterval|0);this.frameSequence=0;this.lastHeapUsedBytes=null;this.heapPeakBytes=0;this.gcObserver=null;this.gcSupported=false;
    if(typeof PerformanceObserverClass==='function'&&PerformanceObserverClass.supportedEntryTypes?.includes('gc'))try{
      this.gcObserver=new PerformanceObserverClass(list=>{for(const entry of list.getEntries()){this.count('gcCount');this.current.times.gcMs=(this.current.times.gcMs||0)+Math.max(0,entry.duration||0);}});
      this.gcObserver.observe({type:'gc',buffered:true});this.gcSupported=true;
    }catch{this.gcObserver?.disconnect?.();this.gcObserver=null;}
    this.lastValues.gcSupported=this.gcSupported;
  }
  begin(name){const stack=this.started.get(name)||[];stack.push(this.clock());this.started.set(name,stack);}
  end(name){const stack=this.started.get(name);if(!stack?.length)return 0;const elapsed=Math.max(0,this.clock()-stack.pop());if(!stack.length)this.started.delete(name);this.current.times[name]=(this.current.times[name]||0)+elapsed;return elapsed;}
  measure(name,callback){this.begin(name);try{return callback();}finally{this.end(name);}}
  count(name,amount=1){this.current.counts[name]=(this.current.counts[name]||0)+amount;}
  set(name,value){this.current.values[name]=value;}
  recordSave(durationMs,bytes=0){
    if(!Number.isFinite(durationMs)||durationMs<0)return;
    this.count('saveCount');this.totalSaveCount++;this.set('saveBytes',Math.max(0,Number(bytes)||0));
    this.saveDurations.push(durationMs);if(this.saveDurations.length>120)this.saveDurations.shift();
  }
  endFrame(timestamp=this.clock()){
    this.frameSequence++;
    const frameTime=Math.max(0,timestamp-this.lastFrameAt);this.lastFrameAt=timestamp;
    if(frameTime>33)this.count('longFrameCount');
    if(frameTime>50)this.count('severeFrameCount');
    if(this.frameSequence%this.memorySampleInterval===0){
      let heapUsedBytes=null;try{const value=this.memoryUsage?.();if(Number.isFinite(value)&&value>=0)heapUsedBytes=value;}catch{}
      if(heapUsedBytes!=null){
        this.heapPeakBytes=Math.max(this.heapPeakBytes,heapUsedBytes);
        if(this.lastHeapUsedBytes!=null&&this.lastHeapUsedBytes-heapUsedBytes>=1024*1024){this.current.values.heapDropBytes=this.lastHeapUsedBytes-heapUsedBytes;this.count('heapDropCount');}
        this.lastHeapUsedBytes=heapUsedBytes;this.current.values.heapUsedBytes=heapUsedBytes;this.current.values.heapPeakBytes=this.heapPeakBytes;
      }
    }
    Object.assign(this.lastValues,this.current.values);
    this.frames.push({times:this.current.times,counts:this.current.counts,values:{...this.lastValues},frameTime});
    this.frameTimeTotal+=frameTime;
    if(this.frames.length>this.windowSize){const removed=this.frames.shift();this.frameTimeTotal-=removed.frameTime;}
    this.current={times:{},counts:{},values:{}};
  }
  currentFps(){return this.frameTimeTotal>0?1000*this.frames.length/this.frameTimeTotal:0;}
  snapshot({includePercentiles=false}={}){
    const frames=this.frames,count=frames.length,totalMs=frames.reduce((sum,frame)=>sum+frame.frameTime,0),result={fps:totalMs?1000*count/totalMs:0,frameTime:count?totalMs/count:0};
    for(const key of TIME_KEYS)result[key]=count?frames.reduce((sum,frame)=>sum+(frame.times[key]||0),0)/count:0;
    for(const key of COUNT_KEYS)result[key]=totalMs?frames.reduce((sum,frame)=>sum+(frame.counts[key]||0),0)*1000/totalMs:0;
    result.saveEventsPerSec=this.clock()>this.startedAt?this.totalSaveCount*1000/(this.clock()-this.startedAt):0;
    const saves=this.saveDurations.slice().sort((a,b)=>a-b);
    result.saveDurationP50Ms=percentile(saves,.5);result.saveDurationP95Ms=percentile(saves,.95);result.saveDurationMaxMs=saves.at(-1)||0;
    result.pressureIterationsAvg=result.pressureSolveCount?result.pressureIterationsUsed/result.pressureSolveCount:0;
    result.pressureEarlyExitPercent=result.pressureSolveCount?100*result.pressureEarlyExitCount/result.pressureSolveCount:0;
    result.advectionSubstepsAvg=result.pressureSolveCount?result.advectionSubstepsUsed/result.pressureSolveCount:0;
    result.physicsSubstepsAvg=count?frames.reduce((sum,frame)=>sum+(frame.counts.physicsSubsteps||0),0)/count:0;
    result.visibleEntities=frames.length?(frames.at(-1).values.visibleEntities||0):0;
    result.totalEntities=frames.length?(frames.at(-1).values.totalEntities||0):0;
    result.saveBytes=frames.length?(frames.at(-1).values.saveBytes||0):0;
    result.saveBytesEstimated=frames.length?Boolean(frames.at(-1).values.saveBytesEstimated):false;
    for(const key of ['saveStateMs','saveTilesMs','saveEntitiesMs','saveUtilitiesMs','saveBuildMs'])result[key]=frames.length?(frames.at(-1).values[key]||0):0;
    result.saveCaptureMs=frames.length?(frames.at(-1).values.saveCaptureMs||0):0;
    result.saveSerializeMs=frames.length?(frames.at(-1).values.saveSerializeMs||0):0;
    result.saveStorageMs=frames.length?(frames.at(-1).values.saveStorageMs||0):0;
    result.physicsSubstepsMax=frames.length?(frames.at(-1).values.physicsSubstepsMax||0):0;
    result.physicsStepSeconds=frames.length?(frames.at(-1).values.physicsStepSeconds||0):0;
    result.pressureIterationsMax=frames.reduce((max,frame)=>Math.max(max,frame.values.pressureIterationsMax||0),0);
    result.advectionSubstepsMax=frames.reduce((max,frame)=>Math.max(max,frame.values.advectionSubstepsMax||0),0);
    result.staticEntities=frames.length?(frames.at(-1).values.staticEntities||0):0;
    result.dynamicEntities=frames.length?(frames.at(-1).values.dynamicEntities||0):0;
    result.renderedDucts=frames.length?(frames.at(-1).values.renderedDucts||0):0;
    result.renderedFluidLinks=frames.length?(frames.at(-1).values.renderedFluidLinks||0):0;
    result.physicsBacklogSeconds=frames.length?(frames.at(-1).values.physicsBacklogSeconds||0):0;
    result.gcSupported=frames.length?Boolean(frames.at(-1).values.gcSupported):this.gcSupported;
    result.heapUsedBytes=frames.length?(frames.at(-1).values.heapUsedBytes??null):null;
    result.heapPeakBytes=frames.length?(frames.at(-1).values.heapPeakBytes??0):0;
    result.heapDropBytes=frames.length?(frames.at(-1).values.heapDropBytes||0):0;
    if(includePercentiles&&count){
      const times=frames.map(frame=>frame.frameTime).sort((a,b)=>a-b);
      result.frameTimeP50=times[Math.floor((times.length-1)*.5)];
      result.frameTimeP95=times[Math.floor((times.length-1)*.95)];
      result.fpsP50=1000/Math.max(1,result.frameTimeP50);
      result.fpsP95Low=1000/Math.max(1,result.frameTimeP95);
    }
    return result;
  }
  dispose(){this.gcObserver?.disconnect?.();this.gcObserver=null;}
}
