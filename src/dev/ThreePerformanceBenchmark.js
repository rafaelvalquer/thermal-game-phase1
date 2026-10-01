export const THREE_BENCHMARK_SCENARIOS=Object.freeze({
  A:Object.freeze({racks:50,auxiliaries:20,ducts:100}),
  B:Object.freeze({racks:100,auxiliaries:40,ducts:250}),
  C:Object.freeze({racks:200,auxiliaries:80,ducts:500}),
  D:Object.freeze({racks:400,auxiliaries:150,ducts:1000}),
});
export const THREE_BENCHMARK_MODES=Object.freeze(['normal','thermal','airflow','power','cooling']);
export const THREE_BENCHMARK_LIMITS=Object.freeze({drawCalls:72,meshGroups:72,adjacentGrowth:2.5});
const RACK_TYPES=['serverRack','computeRack'],SPECIALIZATIONS=['cpu','gpu','storage'];
const now=()=>globalThis.performance?.now?.()??Date.now();
const percentile=(values,p)=>{if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)];};
const heapUsed=()=>Number.isFinite(globalThis.performance?.memory?.usedJSHeapSize)?globalThis.performance.memory.usedJSHeapSize:null;
const rendererMetrics=renderer=>({renderCalls:renderer.adapter?.info?.render?.calls??0,triangles:renderer.adapter?.info?.render?.triangles??0,meshes:renderer.scene?.children?.filter(child=>child.isMesh).length??0,geometryCount:renderer.adapter?.info?.memory?.geometries??null,textureCount:renderer.adapter?.info?.memory?.textures??null,memoryBytes:heapUsed()});
function observeGc(){let supported=false,count=0,observer=null;try{const Observer=globalThis.PerformanceObserver,supportedTypes=Observer?.supportedEntryTypes||[];if(Observer&&supportedTypes.includes('gc')){supported=true;observer=new Observer(list=>{count+=list.getEntries().length;});observer.observe({type:'gc',buffered:true});}}catch{}return {get supported(){return supported;},get count(){return supported?count:null;},disconnect(){observer?.disconnect();}};}

export function createThreeBenchmarkSnapshot(profile='A',mode='normal',version=1){
  const config=THREE_BENCHMARK_SCENARIOS[String(profile).toUpperCase()];if(!config)throw new Error(`Perfil Three.js desconhecido: ${profile}`);
  const width=128,height=80,size=width*height,materialIds=Array(size).fill('air'),temperatures=new Float32Array(size),ownedTiles=new Uint8Array(size).fill(1);
  temperatures.fill(mode==='thermal'?31:25);
  const equipment=[],add=(type,x,y,extra={})=>equipment.push({id:`three-${profile}-${equipment.length}`,type,kind:'entity',x,y,rotation:0,direction:{x:1,y:0},status:'running',temperature:temperatures[y*width+x]||25,inletAirTemperature:25,powerKW:type.includes('Rack')?8:1,ratedPowerKW:12,occupancy:.65,utilization:.65,contractIds:[],contractNames:[],capacity:{},flowRate:1,airflow:1,currentAirFlow:2,fanSpeed:.7,fanActive:true,maxAirFlow:6,coolingLoadKW:20,availableCapacityKW:55,supplyTemperature:18,returnTemperature:28,enabled:true,powerBlocked:false,footprintLength:1,...extra});
  const rackColumns=20;
  for(let index=0;index<config.racks;index++){
    const x=4+index%rackColumns,y=4+Math.floor(index/rackColumns),cloud=index%2===1,type=cloud?RACK_TYPES[1]:RACK_TYPES[0];
    add(type,x,y,{specialization:cloud?SPECIALIZATIONS[index%3]:null,modelId:'professional',occupancy:.35+(index%60)/100,powerKW:3+(index%9),contractIds:[`contract-${index%30}`],contractNames:[`Cliente ${index%30+1}`]});
  }
  for(let index=0;index<config.auxiliaries;index++){
    const x=34+index%30,y=5+Math.floor(index/30)*2;
    const type=index%4===0?'coolingUnit':index%4===1?'supplyVent':index%4===2?'fan':'exhaust';
    add(type,x,y,{direction:index%2?{x:0,y:1}:{x:1,y:0},footprintLength:type==='coolingUnit'&&index%8===0?2:1});
  }
  const ductStart=34,ductRows=Math.ceil(config.ducts/94),ductPoints=[];
  for(let index=0;index<config.ducts;index++){
    const row=Math.floor(index/94),offset=index%94,x=ductStart+offset,y=24+row*2;
    const record={id:`three-${profile}-duct-${index}`,type:'duct',kind:'entity',x,y,rotation:0,direction:{x:1,y:0},status:'running',enabled:true,powerBlocked:false,occupancy:0,contractIds:[],contractNames:[],ductConnections:[],ductShape:'isolated'};
    equipment.push(record);ductPoints.push(record);
  }
  const ductByPoint=new Map(ductPoints.map(record=>[`${record.x},${record.y}`,record]));
  for(const duct of ductPoints){const directions=[];for(const [dx,dy,name] of [[1,0,'east'],[-1,0,'west'],[0,1,'south'],[0,-1,'north']])if(ductByPoint.has(`${duct.x+dx},${duct.y+dy}`))directions.push(name);duct.ductConnections=directions.map(direction=>({direction,type:'duct'}));duct.ductShape=directions.length>=4?'cross':directions.length===3?'tee':directions.length===2?(directions.includes('east')&&directions.includes('west')||directions.includes('north')&&directions.includes('south')?'straight':'curve'):directions.length===1?'end':'isolated';}
  return {version,createdAt:now(),world:{width,height,tileSize:1,materialTopologyVersion:1,entityVisualVersion:equipment.length,utilityTopologyVersion:1,landTopologyVersion:1,materialIds,temperatures,ownedTiles},player:{x:64,y:1.65,z:40},equipment,metrics:{averageTemperature:25,maxAirTemperature:35,powerKW:config.racks*8,gridCapacityKW:10000,solarKW:0,gridPowerKW:config.racks*8,alerts:0,alertEquipmentIds:[]},simulation:{airX:new Float32Array(size),airY:new Float32Array(size),airVersion:1,thermalVersion:1}};
}

export function checkThreeBenchmarkGate(reports,{dynamicReports=[],constructionReport=null}={}){
  const measuredReports=[...reports,...dynamicReports];
  const failures=[],ordered=['A','B','C','D'].map(name=>reports.find(report=>report.scenario===name)).filter(Boolean);
  if(ordered.length!==4)failures.push(`esperados 4 perfis, recebidos ${ordered.length}`);
  const worstByProfile=['A','B','C','D'].map(scenario=>{
    const modes=measuredReports.filter(report=>report.scenario===scenario);
    if(!modes.length)return null;
    return {scenario,frameTimeP95:Math.max(...modes.map(report=>report.frameTimeP95||0)),renderTimeP95:Math.max(...modes.map(report=>report.renderTimeP95||0)),renderCalls:Math.max(...modes.map(report=>report.renderCalls||0)),meshes:Math.max(...modes.map(report=>report.meshes||0))};
  }).filter(Boolean);
  for(const report of worstByProfile){if(report.renderCalls>THREE_BENCHMARK_LIMITS.drawCalls)failures.push(`${report.scenario}: ${report.renderCalls} draw calls excedem ${THREE_BENCHMARK_LIMITS.drawCalls}`);if(report.meshes>THREE_BENCHMARK_LIMITS.meshGroups)failures.push(`${report.scenario}: ${report.meshes} mesh groups excedem ${THREE_BENCHMARK_LIMITS.meshGroups}`);}
  if(worstByProfile.length===4){
    for(let index=1;index<worstByProfile.length;index++){
      const previous=worstByProfile[index-1],current=worstByProfile[index];
      const frameRatio=current.frameTimeP95/Math.max(previous.frameTimeP95,0.1);
      const renderRatio=current.renderTimeP95/Math.max(previous.renderTimeP95,0.1);
      const drawRatio=current.renderCalls/Math.max(previous.renderCalls,1);
      if(frameRatio>THREE_BENCHMARK_LIMITS.adjacentGrowth)failures.push(`frame p95 ${previous.scenario}→${current.scenario} cresceu ${frameRatio.toFixed(2)}× (limite ${THREE_BENCHMARK_LIMITS.adjacentGrowth}×)`);
      if(renderRatio>THREE_BENCHMARK_LIMITS.adjacentGrowth)failures.push(`render p95 ${previous.scenario}→${current.scenario} cresceu ${renderRatio.toFixed(2)}× (limite ${THREE_BENCHMARK_LIMITS.adjacentGrowth}×)`);
      if(drawRatio>THREE_BENCHMARK_LIMITS.adjacentGrowth)failures.push(`draw calls ${previous.scenario}→${current.scenario} cresceram ${drawRatio.toFixed(2)}× (instancing esperado)`);
    }
  }
  if(constructionReport&&!constructionReport.ok)failures.push('construção 3D deixou entidades ou meshes fora de sincronia');
  return {ok:failures.length===0,failures};
}

export class ThreePerformanceBenchmark {
  constructor(renderer,{snapshotFactory=createThreeBenchmarkSnapshot,requestFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve))}={}){this.renderer=renderer;this.snapshotFactory=snapshotFactory;this.requestFrame=requestFrame;this.running=false;}
  async measure(snapshot,{mode,kind='static',frames,warmupFrames,mutate=null,snapshotMs=0,gcMonitor,onProgress=()=>{}}){
    const frameIntervals=[],renderTimes=[],build=[],sync=[],update=[],draw=[],heapStart=heapUsed(),gcStart=gcMonitor?.count;
    const renderFrame=frame=>{if(mutate)mutate(snapshot,frame);snapshot.createdAt=now();const start=now();this.renderer.render(snapshot,{overlay:mode,ceiling:true,dt:1/60});renderTimes.push(now()-start);const timing=this.renderer.lastFrameTimings||{};build.push(timing.worldBuildMs||0);sync.push(timing.equipmentSyncMs||0);update.push(timing.visualUpdateMs||0);draw.push(timing.drawMs||0);};
    for(let frame=0;frame<warmupFrames;frame++){await this.requestFrame();renderFrame(-warmupFrames+frame);}
    let previousFrame=await this.requestFrame();
    for(let frame=0;frame<frames;frame++){const frameTimestamp=await this.requestFrame();frameIntervals.push(frameTimestamp-previousFrame);previousFrame=frameTimestamp;renderFrame(frame);}
    const metrics=rendererMetrics(this.renderer),heapEnd=metrics.memoryBytes,record={kind,scenario:snapshot.scenario||null,mode,equipment:snapshot.equipment.length,snapshotMs:Number(snapshotMs.toFixed(3)),frameTimeP50:Number(percentile(frameIntervals,.5).toFixed(3)),frameTimeP95:Number(percentile(frameIntervals,.95).toFixed(3)),renderTimeP50:Number(percentile(renderTimes,.5).toFixed(3)),renderTimeP95:Number(percentile(renderTimes,.95).toFixed(3)),fpsP50:Number((1000/Math.max(.001,percentile(frameIntervals,.5))).toFixed(1)),fpsP95Low:Number((1000/Math.max(.001,percentile(frameIntervals,.95))).toFixed(1)),worldBuildP95:Number(percentile(build,.95).toFixed(3)),equipmentSyncP95:Number(percentile(sync,.95).toFixed(3)),visualUpdateP95:Number(percentile(update,.95).toFixed(3)),drawP95:Number(percentile(draw,.95).toFixed(3)),...metrics,heapGrowthBytes:heapStart!==null&&heapEnd!==null?heapEnd-heapStart:null,gcEvents:gcMonitor?.supported?gcMonitor.count-gcStart:null};
    onProgress(record);return record;
  }
  async run({profiles=Object.keys(THREE_BENCHMARK_SCENARIOS),modes=THREE_BENCHMARK_MODES,warmupFrames=20,frames=120,includeDynamic=true,dynamicProfile=profiles.at(-1)||'D',includeConstruction=true,onProgress=()=>{}}={}){
    if(this.running)throw new Error('O benchmark 3D já está em execução.');this.running=true;const reports=[],dynamicReports=[],gcMonitor=observeGc();
    try{
      for(const scenario of profiles)for(const mode of modes){const snapshotStarted=now(),snapshot=this.snapshotFactory(scenario,mode,Date.now()),snapshotMs=now()-snapshotStarted;snapshot.scenario=scenario;reports.push(await this.measure(snapshot,{mode,kind:'static',frames,warmupFrames,snapshotMs,gcMonitor,onProgress}));}
      if(includeDynamic)for(const mode of modes){
        const snapshotStarted=now(),snapshot=this.snapshotFactory(dynamicProfile,mode,Date.now()),snapshotMs=now()-snapshotStarted;snapshot.scenario=dynamicProfile;
        const rackRecords=snapshot.equipment.filter(record=>record.type==='serverRack'||record.type==='computeRack'),extraIds=new Set();
        dynamicReports.push(await this.measure(snapshot,{mode,kind:'dynamic',frames,warmupFrames,snapshotMs,gcMonitor,onProgress,mutate:(state,frame)=>{
          const rack=rackRecords[Math.abs(frame)%Math.max(1,rackRecords.length)];if(rack){const value=25+((frame*17)%1500)/100,index=rack.y*state.world.width+rack.x;rack.temperature=value;rack.inletAirTemperature=value-2;rack.utilization=.25+(frame%60)/100;rack.occupancy=rack.utilization;rack.powerKW=rack.ratedPowerKW*rack.utilization;rack.contractIds=[`contract-${Math.floor(frame/15)%30}`];rack.contractNames=[`Cliente ${Math.floor(frame/15)%30+1}`];if(state.world.temperatures)state.world.temperatures[index]=value;}
          state.metrics.powerKW=(state.metrics.powerKW||0)*(0.999+((frame%5)*.0002));state.metrics.gridPowerKW=state.metrics.powerKW;state.metrics.solarKW=(frame%24)*100;
          if(frame>=0&&frame%30===0){const id=`three-dynamic-${dynamicProfile}-${frame}`,old=[...extraIds].at(-1);if(old){state.equipment=state.equipment.filter(record=>record.id!==old);extraIds.delete(old);}else{state.equipment.push({id,type:'fan',kind:'entity',x:90+(frame%12),y:60+Math.floor(frame/12)%10,rotation:0,direction:{x:1,y:0},status:'running',enabled:true,powerBlocked:false,occupancy:0,contractIds:[`contract-${frame%10}`],contractNames:[`Cliente ${frame%10+1}`]});extraIds.add(id);}state.world.entityVisualVersion=(state.world.entityVisualVersion||0)+1;}
          state.simulation.thermalVersion=(state.simulation.thermalVersion||0)+1;state.simulation.airVersion=(state.simulation.airVersion||0)+1;
        }}));
      }
      const constructionReport=includeConstruction?await this.runConstructionBenchmark({gcMonitor,onProgress}):null,renderer=this.renderer.adapter.renderer,context=renderer.getContext?.(),report={kind:'three-webgl',generatedAt:new Date().toISOString(),renderer:context?.getParameter?.(context.RENDERER)||'WebGL',reports,dynamicReports,constructionReport,gcEventsSupported:gcMonitor.supported};
      report.gate=checkThreeBenchmarkGate(reports,{dynamicReports,constructionReport});return report;
    }finally{gcMonitor.disconnect();this.running=false;}
  }
  async runConstructionBenchmark({gcMonitor=null,onProgress=()=>{}}={}){
    const snapshot=this.snapshotFactory('A','normal',Date.now());snapshot.scenario='construction';snapshot.equipment=[];snapshot.world.entityVisualVersion=(snapshot.world.entityVisualVersion||0)+1;const stages=[],meshCount=()=>this.renderer.scene?.children?.filter(child=>child.isMesh).length??0;
    const transition=async(stage,equipment)=>{
      const heapStart=heapUsed(),meshesBefore=meshCount(),started=now();snapshot.equipment=equipment;snapshot.world.entityVisualVersion=(snapshot.world.entityVisualVersion||0)+1;await this.requestFrame();snapshot.createdAt=now();const renderStarted=now();this.renderer.render(snapshot,{overlay:'normal',ceiling:true,dt:1/60});const renderMs=this.renderer.lastFrameTimings?.totalMs??now()-renderStarted;await this.requestFrame();
      const expected=new Set(equipment.map(record=>record.id)),actualIds=this.renderer.equipment?.getEquipmentIds?.()||[...expected],meshIds=this.renderer.equipment?.getMeshIds?.()||[...expected],metrics=rendererMetrics(this.renderer),result={stage,equipment:equipment.length,renderMs:Number(renderMs.toFixed(3)),meshGroupsBefore:meshesBefore,meshGroupsAfter:meshCount(),orphanEquipmentCount:actualIds.filter(id=>!expected.has(id)).length,missingEquipmentCount:[...expected].filter(id=>!actualIds.includes(id)).length,orphanMeshCount:meshIds.filter(id=>!expected.has(id)).length,missingMeshCount:[...expected].filter(id=>!meshIds.includes(id)).length,memoryBytes:metrics.memoryBytes,heapGrowthBytes:heapStart!==null&&metrics.memoryBytes!==null?metrics.memoryBytes-heapStart:null,geometryCount:metrics.geometryCount,textureCount:metrics.textureCount};
      result.transitionMs=Number((now()-started).toFixed(3));stages.push(result);onProgress({kind:'construction',...result});return result;
    };
    const oneHundredRacks=this.snapshotFactory('B','normal',Date.now()).equipment.filter(record=>record.type==='serverRack'||record.type==='computeRack').slice(0,100),oneHundredDucts=this.snapshotFactory('A','normal',Date.now()).equipment.filter(record=>record.type==='duct').slice(0,100),builtRacks=await transition('build-100-racks',oneHundredRacks),remainingRacks=oneHundredRacks.slice(0,50),removedRacks=await transition('remove-50-racks',remainingRacks),builtDucts=await transition('build-100-ducts',[...remainingRacks,...oneHundredDucts]),removedDucts=await transition('remove-50-ducts',[...remainingRacks,...oneHundredDucts.slice(0,50)]);
    const ok=stages.every(stage=>stage.orphanEquipmentCount===0&&stage.missingEquipmentCount===0&&stage.orphanMeshCount===0&&stage.missingMeshCount===0);
    return {kind:'construction',ok,stages,finalEquipmentCount:removedDucts.equipment,expectedEquipmentCounts:[100,50,150,100],buildRacksMs:builtRacks.renderMs,removeRacksMs:removedRacks.renderMs,buildDuctsMs:builtDucts.renderMs,removeDuctsMs:removedDucts.renderMs,heapGrowthBytes:stages.every(stage=>stage.heapGrowthBytes!==null)?stages.reduce((sum,stage)=>sum+stage.heapGrowthBytes,0):null,gcEvents:gcMonitor?.count??null};
  }
}

export function downloadThreeBenchmark(report){
  if(typeof document==='undefined'||typeof Blob==='undefined')return false;
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='thermal-game-three-benchmark.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
}
