import { Toolbar } from './Toolbar.js';
import { Inspector } from './Inspector.js';
import { MetricsPanel } from './MetricsPanel.js';

const MODE_HELP={
  normal:'Operação · efeitos físicos em tempo real',
  thermal:'Térmico · cores representam temperatura',
  airflow:'Airflow · setas mostram direção e intensidade',
  fluid:'Fluido · cor da água e pulsos mostram calor e vazão',
};

export class UIManager {
  constructor(game){
    this.game=game;this.toolbar=new Toolbar(document.querySelector('#tools'),game.build);this.inspector=new Inspector(document.querySelector('#inspector'));
    this.metrics=new MetricsPanel(document.querySelector('#metrics'));this.graph=document.querySelector('#history');this.graphCtx=this.graph.getContext('2d');
    this.bind();game.build.onChange=()=>{this.toolbar.render();if(game.build.selected)game.renderer.selectedEntity=null;};
  }

  bind(){
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
      this.game.renderer.mode=b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));
      const help=document.querySelector('#modeHelp');if(help)help.textContent=MODE_HELP[b.dataset.mode];
    });
    document.querySelector('#pauseBtn').onclick=()=>this.game.sim.togglePause();
    document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>this.game.setSpeed(Number(b.dataset.speed)));
    document.querySelector('#resetBtn').onclick=()=>location.reload();
  }

  inspectAt(x,y){
    const e=this.game.world.entityAt(x,y);
    this.inspector.setTarget(e?{kind:'entity',entity:e}:{kind:'tile',x,y});
    this.game.renderer.selectedEntity=e||null;
  }

  update(){
    const g=this.game,s=g.sim;this.metrics.update(s,g.build);this.inspector.update(g.world);
    document.querySelector('#clock').textContent=this.formatTime(s.elapsed);
    document.querySelector('#missionText').textContent=s.mission.message;
    document.querySelector('#pauseBtn').textContent=s.paused?'▶ Continuar':'Ⅱ Pausar';
    document.querySelector('#speedLabel').textContent=s.speed+'×';
    document.querySelector('#rotateHint').textContent=g.build.selected&&['fan','exhaust'].includes(g.build.selected)?'Direção: '+['→','↓','←','↑'][g.build.rotation]+' · R gira':'';
    this.updateAlerts();this.drawGraph();this.updateEndState();
  }

  updateAlerts(){
    const root=document.querySelector('#alerts');if(!root)return;
    const s=this.game.sim,m=s.metrics,alerts=[];
    if(m.maxTemp>=80)alerts.push(['critical','OVERHEAT','Máquina em faixa crítica']);
    else if(m.maxTemp>40)alerts.push(['warn','HOTSPOT','Temperatura acima da meta']);
    if(m.powerDraw>10000)alerts.push(['critical','POWER LIMIT','Limite elétrico excedido']);
    const fluids=this.game.world.entities.filter(e=>['pipe','pump','tank','radiator','exchanger'].includes(e.type));
    if(fluids.length&&fluids.every(e=>(e.flowRate||0)<.02))alerts.push(['warn','LOW FLOW','Rede hidráulica sem circulação']);
    root.innerHTML=alerts.length?alerts.map(a=>'<div class="alert '+a[0]+'"><b>'+a[1]+'</b><span>'+a[2]+'</span></div>').join(''):'<div class="alert ok"><b>SYSTEM NOMINAL</b><span>Nenhum alerta operacional</span></div>';
  }

  setSpeedButtons(v){document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===v));}
  formatTime(s){const m=Math.floor(s/60),sec=Math.floor(s%60);return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}

  drawGraph(){
    const c=this.graph,ctx=this.graphCtx,r=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.max(10,Math.floor(r.width*dpr)),h=Math.max(10,Math.floor(r.height*dpr));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);const W=w/dpr,H=h/dpr;
    ctx.clearRect(0,0,W,H);ctx.strokeStyle='rgba(148,163,184,.12)';ctx.lineWidth=1;
    for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,H*i/4);ctx.lineTo(W,H*i/4);ctx.stroke();}
    const data=this.game.sim.history;if(data.length<2)return;
    const min=20,max=Math.max(85,...data.map(d=>d.max));
    const draw=(key,stroke,width)=>{ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.beginPath();data.forEach((d,i)=>{const x=i/(data.length-1)*W,y=H-(d[key]-min)/(max-min)*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
    draw('max','#fb7185',2);draw('avg','#67e8f9',1.5);
    const safeY=H-(40-min)/(max-min)*H;ctx.strokeStyle='rgba(250,204,21,.35)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(0,safeY);ctx.lineTo(W,safeY);ctx.stroke();ctx.setLineDash([]);
  }

  updateEndState(){
    const s=this.game.sim;if(s.mission.state==='running')return;
    const modal=document.querySelector('#endModal');modal.classList.add('show');
    document.querySelector('#endTitle').textContent=s.mission.state==='won'?'MISSÃO CONCLUÍDA':'FALHA TÉRMICA';
    document.querySelector('#endText').textContent=s.mission.state==='won'?'Você estabilizou o sistema abaixo de 40°C dentro do limite elétrico.':s.mission.failReason;
  }
}
