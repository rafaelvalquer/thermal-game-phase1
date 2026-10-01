import './style.css';
import './datacenter.css';
import './industrial.css';
import './staff.css';
import './contract-center.css';
import './sim-controls.css';
import './three.css';
import './campaign.css';
import { Game } from './game/Game.js';
import { CampaignManager } from './campaign/CampaignManager.js';
import { CampaignScreen } from './ui/CampaignScreen.js';
import { createBrowserBenchmarkLevel } from './dev/BrowserPerformanceBenchmark.js';
import { DataCenterSaveSystem } from './datacenter/DataCenterSaveSystem.js';

const app=document.querySelector('#app');
const campaign=new CampaignManager();

const gameShell=(level)=>{
  const isDatacenter=Boolean(level.datacenterSandbox),speeds=isDatacenter?[1,2,4,8,24]:[1,2,4];
  const benchmarkHud=level.performanceBenchmark?'<section class="benchmark-hud" aria-live="polite"><strong>BENCHMARK DE NAVEGADOR · '+level.performanceBenchmark+'</strong><pre id="benchmarkOutput">Amostrando Canvas e simulação…</pre><button id="benchmarkDownload" disabled>Baixar relatório JSON</button></section>':'';
  return [
  '<div class="shell">',
    '<header class="topbar">',
      '<div class="brand"><div class="brand-mark"><span>Δ</span><small>T</small></div><div><h1>'+ (isDatacenter?'DATA CENTER SIMULATOR':'THERMAL LAB')+'</h1><p>'+ (isDatacenter?'OPERAÇÃO CONTÍNUA · SANDBOX':'FASE '+String(level.number).padStart(2,'0')+' · '+level.name.toUpperCase())+'</p></div></div>',
      '<div class="mission-box '+(isDatacenter?'sandbox-mission':'')+'"><span class="eyebrow">'+level.tagline.toUpperCase()+'</span><strong id="missionText">Carregando missão...</strong><span id="rotateHint"></span></div>',
      '<div class="top-telemetry"><div class="budget-chip"><span>ORÇAMENTO</span><strong id="budgetValue">'+(isDatacenter?'R$ ':'$ ')+Number(level.budget||0).toLocaleString('pt-BR')+'</strong></div><div class="top-chart temperature-chart"><div class="top-chart-head"><span>TEMPERATURA</span><small><i class="max-dot"></i> máx <i class="avg-dot"></i> média <i class="safe-dot"></i> alvo</small></div><canvas id="history" aria-label="Gráfico do histórico de temperatura"></canvas></div><div class="top-chart power-chart"><div class="top-chart-head"><span>ENERGIA USADA</span><small><i class="limit-dot"></i> rede <i class="battery-use-dot"></i> descarga <i class="battery-stock-dot"></i> estoque</small></div><div id="powerSummary" class="power-summary" aria-live="polite">Rede 0 / '+(level.powerLimit/1000).toFixed(1)+' kW · Bat 0/0 kWh</div><canvas id="powerHistory" aria-label="Consumo da rede e descarga da bateria em kW; energia armazenada em kWh; limite elétrico tracejado"></canvas></div></div>',
      (isDatacenter?'<button type="button" id="contractCenterButton" class="contract-center-trigger" aria-controls="contractCenter" aria-haspopup="dialog" aria-expanded="false"><span class="cc-trigger-icon" aria-hidden="true">▤</span><span class="cc-trigger-label">CONTRATOS</span><b data-contract-badge hidden></b></button>':''),
      (isDatacenter?'<button type="button" id="landExpansionButton" class="contract-center-trigger land-trigger" aria-controls="landExpansionLayer"><span aria-hidden="true">▦</span><span>TERRENO</span></button>':''),
      '<div class="sim-controls" role="group" aria-label="Controles da simulação"><span id="clock" aria-label="Relógio"><span class="clock-full">'+(isDatacenter?'Ano 1 · Mês 1 · Dia 1 · 00:00':'00:00')+'</span><span class="clock-compact">00:00</span></span><button id="pauseBtn" aria-label="Pausar simulação">Ⅱ Pausar</button><div class="speed-group" role="group" aria-label="Velocidade da simulação">'+speeds.map(speed=>'<button type="button" data-speed="'+speed+'" aria-label="Velocidade '+speed+' vezes" aria-pressed="'+(speed===1)+'">'+speed+'×</button>').join('')+'</div><span id="speedLabel">1×</span><button id="audioToggle" type="button" aria-label="Silenciar áudio" aria-pressed="true" title="Áudio ligado">🔊</button><button id="exitBtn" title="Voltar ao menu" aria-label="Voltar ao menu">⌂</button></div>',
    '</header>',
    '<aside id="toolsPanel" class="left-panel panel">',
      '<div class="panel-head"><span>CONSTRUÇÃO</span><small>R gira · RMB cancela</small><button class="mobile-panel-toggle" data-panel-toggle="rightPanel" aria-controls="rightPanel" aria-expanded="false">Telemetria</button></div>',
      '<div id="tools" class="tools"></div>',
      '<div class="help-card"><b>MISSÃO</b><p>'+level.description+'</p><div class="key-row"><kbd>WASD</kbd><span>câmera</span><kbd>F3</kbd><span>dados físicos</span></div></div>',
    '</aside>',
    '<main class="viewport-wrap">',
      '<canvas id="game"></canvas>',
      '<div id="thermalRiskVignette" class="thermal-risk-vignette" aria-hidden="true"></div>',
      benchmarkHud,
      '<div class="sprite-loading" role="status">CARREGANDO EQUIPAMENTOS<span><i></i></span></div>',
      '<div class="view-switcher" role="toolbar" aria-label="Modos de visualização"><button class="active" data-view-mode="2d" aria-pressed="true">▦ Construção 2D</button><button data-view-mode="walk" aria-pressed="false">◎ Passeio 3D</button><span class="view-divider" aria-hidden="true"></span><button class="active" data-mode="normal">◫ Normal</button><button data-mode="thermal">△ Térmico</button><button data-mode="airflow">〰 Airflow</button><button data-mode="cooling" class="hidden">❄ Climatização</button><button data-mode="pressure">◌ Pressão</button><button data-mode="fluid">≈ Fluido</button></div>',
      '<div id="airflowModes" class="airflow-submodes hidden"><button data-airflow-mode="vectors">Vetores</button><button class="active" data-airflow-mode="streamlines">Streamlines</button><button data-airflow-mode="particles">Partículas</button></div>',
      '<div id="modeHelp" class="mode-help">Operação · zonas, equipamentos e efeitos físicos</div><div id="toast" class="toast"></div>',
    '</main>',
    '<aside id="rightPanel" class="right-panel panel">',
      '<div class="panel-head"><span>TELEMETRIA</span><small>tempo real</small><button class="mobile-panel-toggle" data-panel-toggle="toolsPanel" aria-controls="toolsPanel" aria-expanded="false">Construção</button></div>',
      '<div id="datacenterDashboard" class="datacenter-dashboard '+(isDatacenter?'':'hidden')+'"></div><div id="staffPanel" class="staff-panel"></div><div id="metrics" class="metrics"></div><div id="alerts" class="alerts"></div>',
      '<div id="objectives" class="objectives"></div>',
      '<div class="minimap-card"><div class="chart-title"><span>Minimap</span><small>Fases 4+</small></div><canvas id="minimap"></canvas></div>',
      '<div class="panel-head inspector-head"><span>INSPECTOR</span><small>tile / entidade</small></div><div id="inspector" class="inspector"></div>',
      '<button id="resetBtn" class="reset">↻ '+(isDatacenter?'Reiniciar sandbox':'Reiniciar missão')+'</button>',
    '</aside>',
  '</div>',
  '<div id="dailyReport" class="daily-report-layer" hidden></div>',
  (isDatacenter?'<div id="contractCenter" class="contract-center-layer" hidden></div>':''),
  (isDatacenter?'<div id="landExpansionLayer" class="land-expansion-layer" hidden></div>':''),
  '<div id="endModal" class="end-modal"></div>',
].join('');
};

let startSequence=0;
function startLevel(level,{fresh=false}={}){
  const sequence=++startSequence;
  if(fresh)window.__thermalLab?.datacenter?.clearSave();
  window.__thermalLab?.dispose?.();
  app.innerHTML=gameShell(level);
  window.__thermalLab=null;
  const initialize=async()=>{
    let saveSystem=null;
    if(level.datacenterSandbox){
      saveSystem=level.performanceBenchmarkSave?new DataCenterSaveSystem({key:'thermal-lab-performance-benchmark-save-v1'}):new DataCenterSaveSystem();
      if(fresh||level.performanceBenchmarkSave)await saveSystem.clearAsync();else await saveSystem.loadAsync();
    }
    if(sequence!==startSequence)return;
    const game=new Game(document.querySelector('#game'),level,campaign,{saveSystem});
    game.start().then(()=>{if(window.__thermalLab===game)document.querySelector('.sprite-loading')?.classList.add('loaded');});window.__thermalLab=game;
  };
  initialize().catch(error=>{if(sequence===startSequence){const toast=document.querySelector('#toast');if(toast){toast.textContent='Falha ao carregar salvamento: '+error.message;toast.classList.add('show');}}});
}

const screen=new CampaignScreen(app,campaign,startLevel);
const query=new URLSearchParams(location.search),benchmarkName=query.get('benchmark');
if(benchmarkName)startLevel(createBrowserBenchmarkLevel(benchmarkName,{sandboxSave:query.get('save')==='1'}));
else screen.render();
window.__thermalCampaign=campaign;
window.__thermalStartLevel=startLevel;
window.__thermalRunThreeBenchmark=async(options={})=>{
  const [{ThreeRenderer},{ThreePerformanceBenchmark,downloadThreeBenchmark}]=await Promise.all([
    import('./rendering/three/ThreeRenderer.js'),import('./dev/ThreePerformanceBenchmark.js'),
  ]);
  const renderer=new ThreeRenderer({quality:options.quality||'medium'});
  try{
    const benchmark=new ThreePerformanceBenchmark(renderer),report=await benchmark.run(options);
    window.__thermalThreeBenchmarkReport=report;downloadThreeBenchmark(report);return report;
  }finally{renderer.dispose();}
};
if(query.get('benchmark3d')==='1'){
  const profiles=(query.get('profiles')||'A,B,C,D').split(',').filter(Boolean),modes=(query.get('modes')||'normal,thermal,airflow,power,cooling').split(',').filter(Boolean);
  queueMicrotask(()=>window.__thermalRunThreeBenchmark({profiles,modes,frames:Number(query.get('frames'))||120,warmupFrames:Number(query.get('warmupFrames'))||20,includeDynamic:query.get('dynamic')!=='0',includeConstruction:query.get('construction')!=='0'})
    .then(report=>{
      document.title=`Three.js benchmark ${report.gate.ok?'PASS':'FAIL'} · ${report.reports.length} medições`;
      const panel=document.createElement('pre');panel.id='threeBenchmarkReport';panel.setAttribute('role','status');panel.setAttribute('aria-label','Relatório do benchmark Three.js');
      panel.style.cssText='position:fixed;z-index:99999;inset:12px;overflow:auto;margin:0;padding:16px;background:#101a20f2;color:#e6f2f6;border:1px solid #37b9d0;border-radius:8px;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;box-shadow:0 8px 40px #0009';
      const summarize=item=>({scenario:item.scenario,mode:item.mode,kind:item.kind,racks:item.racks,ducts:item.ducts,equipment:item.equipment,frameTimeP50:item.frameTimeP50,frameTimeP95:item.frameTimeP95,renderTimeP50:item.renderTimeP50,renderTimeP95:item.renderTimeP95,fpsP50:item.fpsP50,fpsP95Low:item.fpsP95Low,renderCalls:item.renderCalls,triangles:item.triangles,meshes:item.meshes,snapshotMs:item.snapshotMs,worldBuildP95:item.worldBuildP95,equipmentSyncP95:item.equipmentSyncP95,visualUpdateP95:item.visualUpdateP95,drawP95:item.drawP95,memoryBytes:item.memoryBytes,heapGrowthBytes:item.heapGrowthBytes,gcEvents:item.gcEvents});
      panel.textContent=JSON.stringify({gate:report.gate,renderer:report.renderer,gcEventsSupported:report.gcEventsSupported,static:report.reports.map(summarize),dynamic:report.dynamicReports?.map(summarize)||[],construction:report.constructionReport},null,2);
      document.body.appendChild(panel);
    })
    .catch(error=>{document.title='Three.js benchmark falhou';console.error(error);}));
}
window.__thermalShowCampaign=()=>{const game=window.__thermalLab;if(game?.level?.performanceBenchmarkSave)game.datacenter?.clearSave();else game?.datacenter?.persist({syncBackup:true});game?.dispose?.();window.__thermalLab=null;screen.render();};
window.addEventListener('pagehide',()=>{const game=window.__thermalLab;if(game?.level?.performanceBenchmarkSave)game?.datacenter?.clearSave();else game?.datacenter?.persist({syncBackup:true});});
window.__thermalShowBriefing=level=>{window.__thermalShowCampaign();screen.briefing.show(level);};
