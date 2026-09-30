const SCENARIOS={
  A:{racks:100,units:10,vents:30,ducts:150,technicians:10,batteries:0,panels:0,computeRacks:20,cloudContracts:20},
  B:{racks:200,units:20,vents:60,ducts:300,technicians:25,batteries:0,panels:0,computeRacks:40,cloudContracts:40},
  C:{racks:300,units:30,vents:100,ducts:500,technicians:40,batteries:20,panels:30,computeRacks:60,cloudContracts:60},
  E:{racks:400,units:40,vents:120,ducts:600,technicians:50,batteries:30,panels:40,computeRacks:80,cloudContracts:80},
};

export function browserBenchmarkScenarios(){return Object.fromEntries(Object.entries(SCENARIOS).map(([key,value])=>[key,{...value}]));}

export function createBrowserBenchmarkLevel(name='A',{sandboxSave=false}={}){
  const key=String(name).toUpperCase(),scenario=SCENARIOS[key];
  if(!scenario)throw new Error(`Cenário de benchmark desconhecido: ${name}`);
  const rackStartX=34,rackColumns=20,rackRows=Math.ceil(scenario.racks/rackColumns),coolingRows=Math.ceil(scenario.units/2);
  const height=Math.max(32,rackRows+12,coolingRows+12),entities=[];
  const ductRows=Math.floor(scenario.ducts/scenario.units),extraDucts=scenario.ducts%scenario.units;
  const ventRows=Math.floor(scenario.vents/scenario.units),extraVents=scenario.vents%scenario.units;
  for(let index=0;index<scenario.units;index++){
    const row=Math.floor(index/2),side=index%2===0?1:-1,y=2+row;
    const ductCount=ductRows+(index<extraDucts?1:0),ventCount=ventRows+(index<extraVents?1:0);
    const rackEndX=rackStartX+rackColumns-1;
    const x=side>0?rackStartX-ductCount-ventCount-2:rackEndX+ductCount+ventCount+2,direction={x:side,y:0};
    entities.push({type:'coolingUnit',x,y,direction,tier:'commercial'});
    for(let offset=0;offset<ductCount;offset++)entities.push({type:'duct',x:x+side*(offset+1),y,size:'duct'});
    for(let offset=0;offset<ventCount;offset++)entities.push({type:'supplyVent',x:x+side*(ductCount+1+offset),y,direction});
  }
  for(let index=0;index<scenario.racks;index++)entities.push({type:'serverRack',x:rackStartX+index%rackColumns,y:3+Math.floor(index/rackColumns),startAt:0,heatOutput:5000,maxPowerKW:12,currentPowerKW:5,heatOutputKW:4.9,temperature:31});
  for(let index=0;index<scenario.computeRacks;index++)entities.push({type:'computeRack',x:80+index%20,y:4+Math.floor(index/20),specialization:['cpu','gpu','storage'][index%3],modelId:index%6===0?'enterprise':'professional'});
  for(let index=0;index<scenario.technicians;index++)entities.push({type:'technician',x:15+index%50,y:height-6-Math.floor(index/50)*2});
  for(let index=0;index<scenario.batteries;index++)entities.push({type:'battery',x:30+index%20,y:height-6-Math.floor(index/20)*2});
  for(let index=0;index<scenario.panels;index++)entities.push({type:'solarPanel',x:55+index%20,y:height-6-Math.floor(index/20)*2});
  const level={
    id:`browser-performance-${key.toLowerCase()}`,number:0,name:`Performance Benchmark ${key}`,campaign:false,
    tagline:`Benchmark de navegador · cenário ${key}`,description:'Cenário de medição com o Canvas, a física e os equipamentos reais do jogo.',
    briefing:'Use F3 para abrir o painel detalhado. O resumo registra o percentil 50 e 95 do tempo de quadro na janela recente.',
    budget:1e12,powerLimit:1e12,missionDuration:Infinity,thermalSystems:{simpleCooling:true,waterCooling:false},
    map:{width:120,height,rooms:[{x:8,y:0,w:72,h:height}]},entities,
    zones:[{id:'benchmark-rack-hall',name:'Sala de racks',x:rackStartX,y:3,width:rackColumns,height:rackRows,target:30}],
    objectives:[],failures:[],events:[],performanceBenchmark:key,
  };
  if(sandboxSave){
    level.datacenterSandbox=true;level.performanceBenchmarkSave=true;
    level.datacenter={initialCash:1e12,powerCapacityKW:1e9,energyTariff:.55,coolingMaintenanceDaily:0,allBuildTools:true,unlimitedBuildInventory:true};
  }
  return level;
}

export class BrowserPerformanceBenchmark {
  constructor(scenario,monitor){this.scenario=scenario;this.monitor=monitor;this.frameCount=0;this.startedAt=globalThis.performance?.now?.()??Date.now();this.lastReport=null;this.history=[];}
  frame(){
    this.frameCount++;
    if(this.frameCount%60!==0)return null;
    const metrics=this.monitor.snapshot({includePercentiles:true}),now=globalThis.performance?.now?.()??Date.now();
    const sample={elapsedSeconds:Number(((now-this.startedAt)/1000).toFixed(1)),sampledFrames:this.frameCount,renderMode:globalThis.__thermalLab?.renderer?.mode||'normal',...
      Object.fromEntries(['fpsP50','fpsP95Low','frameTimeP50','frameTimeP95','gameLoopWorkMs','gameLoopUpdateMs','gameLoopUpdates','gcSupported','gcCount','gcMs','heapUsedBytes','heapPeakBytes','heapDropBytes','heapDropCount','saveMs','saveCaptureMs','saveStateMs','saveTilesMs','saveEntitiesMs','saveUtilitiesMs','saveBuildMs','saveSerializeMs','saveStorageMs','saveBytes','saveBytesEstimated','saveEventsPerSec','saveDurationP50Ms','saveDurationP95Ms','saveDurationMaxMs','coolingPathAllocations','simulationMs','renderMs','renderTilesMs','renderHeatmapMs','renderDuctsMs','renderEntitiesMs','renderEffectsMs','renderThermalLabelsMs','uiMs','uiGraphMs','airflowMs','pressureMs','thermalMs','thermalStatsMs','coolingMs','fluidMs','fluidTransportMs','fluidRenderMs','energyAccountingMs','longFrameCount','severeFrameCount','pressureIterationsAvg','pressureIterationsMax','pressureEarlyExitPercent','advectionSubstepsAvg','advectionSubstepsMax','physicsSubstepsMax','physicsBacklogSeconds','visibleEntities','totalEntities','renderedDucts','renderedFluidLinks'].map(key=>[key,metrics[key]??0]))};
    this.history.push(sample);if(this.history.length>300)this.history.shift();
    this.lastReport={scenario:this.scenario,...sample,history:this.history.map(entry=>({...entry}))};
    return this.lastReport;
  }
  download(){
    if(!this.lastReport)return false;
    const blob=new Blob([JSON.stringify(this.lastReport,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`thermal-game-browser-benchmark-${this.scenario}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
  }
}
