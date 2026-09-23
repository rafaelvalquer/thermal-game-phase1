import './style.css';
import { Game } from './game/Game.js';
import { CampaignManager } from './campaign/CampaignManager.js';
import { CampaignScreen } from './ui/CampaignScreen.js';

const app=document.querySelector('#app');
const campaign=new CampaignManager();

const gameShell=(level)=>[
  '<div class="shell">',
    '<header class="topbar">',
      '<div class="brand"><div class="brand-mark"><span>Δ</span><small>T</small></div><div><h1>THERMAL LAB</h1><p>FASE '+String(level.number).padStart(2,'0')+' · '+level.name.toUpperCase()+'</p></div></div>',
      '<div class="mission-box"><span class="eyebrow">'+level.tagline.toUpperCase()+'</span><strong id="missionText">Carregando missão...</strong><span id="rotateHint"></span></div>',
      '<div class="sim-controls"><span id="clock">00:00</span><button id="pauseBtn">Ⅱ Pausar</button><div class="speed-group"><button data-speed="1">1×</button><button data-speed="2">2×</button><button data-speed="4">4×</button></div><span id="speedLabel">1×</span><button id="exitBtn" title="Voltar à campanha">⌂</button></div>',
    '</header>',
    '<aside id="toolsPanel" class="left-panel panel">',
      '<div class="panel-head"><span>CONSTRUÇÃO</span><small>R gira · RMB cancela</small><button class="mobile-panel-toggle" data-panel-toggle="rightPanel" aria-controls="rightPanel" aria-expanded="false">Telemetria</button></div>',
      '<div id="tools" class="tools"></div>',
      '<div class="help-card"><b>MISSÃO</b><p>'+level.description+'</p><div class="key-row"><kbd>WASD</kbd><span>câmera</span><kbd>F3</kbd><span>dados físicos</span></div></div>',
    '</aside>',
    '<main class="viewport-wrap">',
      '<canvas id="game"></canvas>',
      '<div class="view-switcher"><button class="active" data-mode="normal">◫ Normal</button><button data-mode="thermal">△ Térmico</button><button id="thermalScaleBtn" class="thermal-scale-switch hidden" data-thermal-scale>Escala fixa</button><button data-mode="airflow">〰 Airflow</button><button data-mode="pressure">◌ Pressão</button><button data-mode="hvac">▤ HVAC</button><button data-mode="fluid">≈ Fluido</button></div>',
      '<div id="airflowModes" class="airflow-submodes hidden"><button data-airflow-mode="vectors">Vetores</button><button class="active" data-airflow-mode="streamlines">Streamlines</button><button data-airflow-mode="particles">Partículas</button></div>',
      '<div id="modeHelp" class="mode-help">Operação · zonas, equipamentos e efeitos físicos</div><div id="toast" class="toast"></div>',
    '</main>',
    '<aside id="rightPanel" class="right-panel panel">',
      '<div class="panel-head"><span>TELEMETRIA</span><small>tempo real</small><button class="mobile-panel-toggle" data-panel-toggle="toolsPanel" aria-controls="toolsPanel" aria-expanded="false">Construção</button></div>',
      '<div id="metrics" class="metrics"></div><div id="alerts" class="alerts"></div>',
      '<div id="objectives" class="objectives"></div>',
      '<div class="chart-card"><div class="chart-title"><span>Temperatura</span><small><i class="max-dot"></i> máx. <i class="avg-dot"></i> média <i class="safe-dot"></i> alvo</small></div><canvas id="history"></canvas></div>',
      '<div class="minimap-card"><div class="chart-title"><span>Minimap</span><small>Fases 4+</small></div><canvas id="minimap"></canvas></div>',
      '<div class="panel-head inspector-head"><span>INSPECTOR</span><small>tile / entidade</small></div><div id="inspector" class="inspector"></div>',
      '<button id="resetBtn" class="reset">↻ Reiniciar missão</button>',
    '</aside>',
  '</div>',
  '<div id="endModal" class="end-modal"></div>',
].join('');

function startLevel(level){
  window.__thermalLab?.loop.stop();
  app.innerHTML=gameShell(level);
  const game=new Game(document.querySelector('#game'),level,campaign);game.start();window.__thermalLab=game;
}

const screen=new CampaignScreen(app,campaign,startLevel);
screen.render();
window.__thermalCampaign=campaign;
window.__thermalStartLevel=startLevel;
window.__thermalShowCampaign=()=>{window.__thermalLab?.loop.stop();window.__thermalLab=null;screen.render();};
window.__thermalShowBriefing=level=>{window.__thermalShowCampaign();screen.briefing.show(level);};
