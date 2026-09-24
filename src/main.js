import './style.css';
import './datacenter.css';
import { Game } from './game/Game.js';
import { CampaignManager } from './campaign/CampaignManager.js';
import { CampaignScreen } from './ui/CampaignScreen.js';

const app=document.querySelector('#app');
const campaign=new CampaignManager();

const gameShell=(level)=>{
  const isDatacenter=Boolean(level.datacenterSandbox),speeds=isDatacenter?[1,2,4,8,24]:[1,2,4];
  return [
  '<div class="shell">',
    '<header class="topbar">',
      '<div class="brand"><div class="brand-mark"><span>Δ</span><small>T</small></div><div><h1>'+ (isDatacenter?'DATA CENTER SIMULATOR':'THERMAL LAB')+'</h1><p>'+ (isDatacenter?'OPERAÇÃO CONTÍNUA · SANDBOX':'FASE '+String(level.number).padStart(2,'0')+' · '+level.name.toUpperCase())+'</p></div></div>',
      '<div class="mission-box '+(isDatacenter?'sandbox-mission':'')+'"><span class="eyebrow">'+level.tagline.toUpperCase()+'</span><strong id="missionText">Carregando missão...</strong><span id="rotateHint"></span></div>',
      '<div class="sim-controls"><span id="clock">'+(isDatacenter?'Ano 1 · Mês 1 · Dia 1 · 00:00':'00:00')+'</span><button id="pauseBtn">Ⅱ Pausar</button><div class="speed-group">'+speeds.map(speed=>'<button data-speed="'+speed+'">'+speed+'×</button>').join('')+'</div><span id="speedLabel">1×</span><button id="exitBtn" title="Voltar ao menu">⌂</button></div>',
    '</header>',
    '<aside id="toolsPanel" class="left-panel panel">',
      '<div class="panel-head"><span>CONSTRUÇÃO</span><small>R gira · RMB cancela</small><button class="mobile-panel-toggle" data-panel-toggle="rightPanel" aria-controls="rightPanel" aria-expanded="false">Telemetria</button></div>',
      '<div id="tools" class="tools"></div>',
      '<div class="help-card"><b>MISSÃO</b><p>'+level.description+'</p><div class="key-row"><kbd>WASD</kbd><span>câmera</span><kbd>F3</kbd><span>dados físicos</span></div></div>',
    '</aside>',
    '<main class="viewport-wrap">',
      '<canvas id="game"></canvas>',
      '<div class="sprite-loading" role="status">CARREGANDO EQUIPAMENTOS<span><i></i></span></div>',
      '<div class="view-switcher"><button class="active" data-mode="normal">◫ Normal</button><button data-mode="thermal">△ Térmico</button><button data-mode="airflow">〰 Airflow</button><button data-mode="cooling" class="hidden">❄ Climatização</button><button data-mode="pressure">◌ Pressão</button><button data-mode="fluid">≈ Fluido</button></div>',
      '<div id="airflowModes" class="airflow-submodes hidden"><button data-airflow-mode="vectors">Vetores</button><button class="active" data-airflow-mode="streamlines">Streamlines</button><button data-airflow-mode="particles">Partículas</button></div>',
      '<div id="modeHelp" class="mode-help">Operação · zonas, equipamentos e efeitos físicos</div><div id="toast" class="toast"></div>',
    '</main>',
    '<aside id="rightPanel" class="right-panel panel">',
      '<div class="panel-head"><span>TELEMETRIA</span><small>tempo real</small><button class="mobile-panel-toggle" data-panel-toggle="toolsPanel" aria-controls="toolsPanel" aria-expanded="false">Construção</button></div>',
      '<div id="datacenterDashboard" class="datacenter-dashboard '+(isDatacenter?'':'hidden')+'"></div><div id="metrics" class="metrics"></div><div id="alerts" class="alerts"></div>',
      '<div id="objectives" class="objectives"></div>',
      '<div class="chart-card"><div class="chart-title"><span>Temperatura</span><small><i class="max-dot"></i> máx. <i class="avg-dot"></i> média <i class="safe-dot"></i> alvo</small></div><canvas id="history"></canvas></div>',
      '<div class="minimap-card"><div class="chart-title"><span>Minimap</span><small>Fases 4+</small></div><canvas id="minimap"></canvas></div>',
      '<div class="panel-head inspector-head"><span>INSPECTOR</span><small>tile / entidade</small></div><div id="inspector" class="inspector"></div>',
      '<button id="resetBtn" class="reset">↻ '+(isDatacenter?'Reiniciar sandbox':'Reiniciar missão')+'</button>',
    '</aside>',
  '</div>',
  '<div id="endModal" class="end-modal"></div>',
].join('');
};

function startLevel(level,{fresh=false}={}){
  if(fresh)window.__thermalLab?.datacenter?.clearSave();
  window.__thermalLab?.loop.stop();
  app.innerHTML=gameShell(level);
  const game=new Game(document.querySelector('#game'),level,campaign);game.start().then(()=>{if(window.__thermalLab===game)document.querySelector('.sprite-loading')?.classList.add('loaded');});window.__thermalLab=game;
}

const screen=new CampaignScreen(app,campaign,startLevel);
screen.render();
window.__thermalCampaign=campaign;
window.__thermalStartLevel=startLevel;
window.__thermalShowCampaign=()=>{window.__thermalLab?.datacenter?.persist();window.__thermalLab?.loop.stop();window.__thermalLab=null;screen.render();};
window.addEventListener('pagehide',()=>window.__thermalLab?.datacenter?.persist());
window.__thermalShowBriefing=level=>{window.__thermalShowCampaign();screen.briefing.show(level);};
