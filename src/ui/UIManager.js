import { Toolbar } from './Toolbar.js';
import { Inspector } from './Inspector.js';
import { MetricsPanel } from './MetricsPanel.js';
import { ObjectivePanel } from './ObjectivePanel.js';
import { Minimap } from './Minimap.js';
import { MissionDebriefing } from './MissionDebriefing.js';

const MODE_HELP={
  normal:'Operação · zonas, equipamentos e efeitos físicos',
  thermal:'Térmico · cores representam temperatura',
  airflow:'Airflow · vetores mostram direção e intensidade',
  fluid:'Fluido · temperatura, sentido e status de cada circuito',
};

export class UIManager {
  constructor(game,campaign){
    this.game=game;this.campaign=campaign;
    this.toolbar=new Toolbar(document.querySelector('#tools'),game.build);
    this.inspector=new Inspector(document.querySelector('#inspector'));
    this.metrics=new MetricsPanel(document.querySelector('#metrics'));
    this.objectives=new ObjectivePanel(document.querySelector('#objectives'));
    this.minimap=new Minimap(document.querySelector('#minimap'),game);
    this.debriefing=new MissionDebriefing(game,campaign);
    this.graph=document.querySelector('#history');this.graphCtx=this.graph.getContext('2d');
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
    document.querySelector('#exitBtn').onclick=()=>location.reload();
  }

  inspectAt(x,y){
    const e=this.game.world.entityAt(x,y);
    this.inspector.setTarget(e?{kind:'entity',entity:e}:{kind:'tile',x,y});
    this.game.renderer.selectedEntity=e||null;
  }

  update(dt=0){
    const g=this.game,s=g.sim;
    this.metrics.update(s,g.build,g.level);this.objectives.update(s);this.inspector.update(g.world);this.minimap.update(dt);
    document.querySelector('#clock').textContent=this.formatTime(s.elapsed);
    document.querySelector('#missionText').textContent=s.mission.message;
    document.querySelector('#pauseBtn').textContent=s.paused?'▶ Continuar':'Ⅱ Pausar';
    document.querySelector('#speedLabel').textContent=s.speed+'×';
    document.querySelector('#rotateHint').textContent=g.build.selected&&['fan','exhaust','pump'].includes(g.build.selected)?'Direção: '+['→','↓','←','↑'][g.build.rotation]+' · R gira':'';
    this.updateAlerts();this.drawGraph();
    if(s.mission.state!=='running')this.debriefing.show();
  }

  updateAlerts(){
    const root=document.querySelector('#alerts');if(!root)return;
    const s=this.game.sim,m=s.metrics,alerts=[],limit=this.game.level.powerLimit;
    if(m.maxTemp>=80)alerts.push(['critical','OVERHEAT','Equipamento em faixa crítica']);
    else if(m.maxTemp>50)alerts.push(['warn','HOTSPOT','Temperatura elevada detectada']);
    if(m.powerDraw>limit)alerts.push(['critical','POWER LIMIT','Limite de '+(limit/1000).toFixed(1)+' kW excedido']);

    const networks=s.fluid.networks||[];
    const badNetwork=networks.find(n=>n.entities.some(e=>e.type==='pump')&&!n.closed);
    if(badNetwork)alerts.push(['warn','FLUID '+badNetwork.status,badNetwork.id+' sem circulação válida']);
    else if(networks.some(n=>n.closed&&n.flowRate<.05))alerts.push(['warn','LOW FLOW','Circuito hidráulico com vazão insuficiente']);

    if(s.mission.lastEventMessage)alerts.push(['warn','MISSION EVENT',s.mission.lastEventMessage]);
    root.innerHTML=alerts.length?alerts.slice(0,3).map(a=>'<div class="alert '+a[0]+'"><b>'+a[1]+'</b><span>'+a[2]+'</span></div>').join(''):'<div class="alert ok"><b>SYSTEM NOMINAL</b><span>Nenhum alerta operacional</span></div>';
  }

  setSpeedButtons(v){document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===v));}
  formatTime(s){const m=Math.floor(s/60),sec=Math.floor(s%60);return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');}

  safeLine(){
    const objectives=this.game.level.objectives||[];
    const temp=objectives.find(o=>['machineTemperature','zoneTemperature','maxAirTemperature'].includes(o.type));
    return temp?.max??40;
  }

  drawGraph(){
    const c=this.graph,ctx=this.graphCtx,r=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.max(10,Math.floor(r.width*dpr)),h=Math.max(10,Math.floor(r.height*dpr));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);const W=w/dpr,H=h/dpr;
    ctx.clearRect(0,0,W,H);ctx.strokeStyle='rgba(148,163,184,.12)';ctx.lineWidth=1;
    for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,H*i/4);ctx.lineTo(W,H*i/4);ctx.stroke();}
    const data=this.game.sim.history;if(data.length<2)return;
    const min=20,max=Math.max(85,...data.map(d=>Math.min(d.max,120)));
    const draw=(key,stroke,width)=>{ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.beginPath();data.forEach((d,i)=>{const value=Math.min(d[key],max),x=i/(data.length-1)*W,y=H-(value-min)/(max-min)*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
    draw('max','#fb7185',2);draw('avg','#67e8f9',1.5);
    const safe=this.safeLine(),safeY=H-(safe-min)/(max-min)*H;ctx.strokeStyle='rgba(250,204,21,.35)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(0,safeY);ctx.lineTo(W,safeY);ctx.stroke();ctx.setLineDash([]);
  }
}
