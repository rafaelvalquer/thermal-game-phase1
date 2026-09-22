import './style.css';
import { Game } from './game/Game.js';

document.querySelector('#app').innerHTML = [
  '<div class="shell">',
    '<header class="topbar">',
      '<div class="brand"><div class="brand-mark"><span>Δ</span><small>T</small></div><div><h1>THERMAL LAB</h1><p>THERMODYNAMIC OPERATIONS · FASE 1</p></div></div>',
      '<div class="mission-box"><span class="eyebrow">MISSÃO · HOT ROOM</span><strong id="missionText">Prepare o sistema.</strong><span id="rotateHint"></span></div>',
      '<div class="sim-controls"><span id="clock">00:00</span><button id="pauseBtn">Ⅱ Pausar</button><div class="speed-group"><button data-speed="1">1×</button><button data-speed="2">2×</button><button data-speed="4">4×</button></div><span id="speedLabel">1×</span></div>',
    '</header>',
    '<aside class="left-panel panel">',
      '<div class="panel-head"><span>CONSTRUÇÃO</span><small>R gira · RMB cancela</small></div>',
      '<div id="tools" class="tools"></div>',
      '<div class="help-card"><b>OBJETIVO OPERACIONAL</b><p>Mantenha as três máquinas abaixo de <strong>40°C</strong> por 5 minutos simulados e respeite o limite de <strong>10 kW</strong>.</p><div class="key-row"><kbd>WASD</kbd><span>câmera</span><kbd>F3</kbd><span>dados físicos</span></div></div>',
    '</aside>',
    '<main class="viewport-wrap">',
      '<canvas id="game"></canvas>',
      '<div class="view-switcher"><button class="active" data-mode="normal">◫ Normal</button><button data-mode="thermal">△ Térmico</button><button data-mode="airflow">〰 Airflow</button><button data-mode="fluid">≈ Fluido</button></div>',
      '<div id="modeHelp" class="mode-help">Operação · efeitos físicos em tempo real</div>',
      '<div id="toast" class="toast"></div>',
    '</main>',
    '<aside class="right-panel panel">',
      '<div class="panel-head"><span>TELEMETRIA</span><small>tempo real</small></div>',
      '<div id="metrics" class="metrics"></div>',
      '<div id="alerts" class="alerts"></div>',
      '<div class="chart-card"><div class="chart-title"><span>Temperatura</span><small><i class="max-dot"></i> máx. <i class="avg-dot"></i> média <i class="safe-dot"></i> 40°C</small></div><canvas id="history"></canvas></div>',
      '<div class="panel-head inspector-head"><span>INSPECTOR</span><small>tile / entidade</small></div>',
      '<div id="inspector" class="inspector"></div>',
      '<button id="resetBtn" class="reset">↻ Reiniciar missão</button>',
    '</aside>',
  '</div>',
  '<div id="endModal" class="end-modal"><div class="end-card"><span>THERMAL LAB</span><h2 id="endTitle">MISSÃO CONCLUÍDA</h2><p id="endText"></p><button onclick="location.reload()">Jogar novamente</button></div></div>',
].join('');

const game = new Game(document.querySelector('#game'));
game.start();
window.__thermalLab = game;
