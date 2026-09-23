import { Toolbar } from './Toolbar.js';
import { Inspector } from './Inspector.js';
import { MetricsPanel } from './MetricsPanel.js';
import { ObjectivePanel } from './ObjectivePanel.js';
import { Minimap } from './Minimap.js';
import { MissionDebriefing } from './MissionDebriefing.js';

const MODE_HELP={
  normal:'Operação · zonas, equipamentos e efeitos físicos',
  thermal:'Térmico · cores representam temperatura',
  airflow:'Airflow · streamlines mostram trajetórias contínuas do campo de velocidade',
  pressure:'Pressão · azul negativa, vermelho positiva, cinza próximo de 0 Pa',
  fluid:'Fluido · temperatura, sentido e status de cada circuito',
  hvac:'HVAC · dutos embutidos, temperatura, pressão e direção da vazão',
};
const HVAC_DUCT_TOOLS=new Set(['smallDuct','mediumDuct','largeDuct']);
const DUCT_HINT=g=>{
  if(HVAC_DUCT_TOOLS.has(g.build.selected))return (g.build.ductInsulated?'Isolado':'Sem isolamento')+' · I alterna · lado retorno inferido pelo vent';
  if(g.build.selected&&['fan','exhaust','pump','supplyVent','returnVent'].includes(g.build.selected))return 'Direção: '+['→','↓','←','↑'][g.build.rotation]+' · R gira';
  if(g.renderer.selectedEntity?.type==='ductDamper')return 'Abertura: '+Math.round(g.renderer.selectedEntity.opening*100)+'% · U abre · J fecha';
  return '';
};

export class UIManager {
  constructor(game,campaign){
    this.game=game;this.campaign=campaign;
    this.toolbar=new Toolbar(document.querySelector('#tools'),game.build);
    this.inspector=new Inspector(document.querySelector('#inspector'));
    this.metrics=new MetricsPanel(document.querySelector('#metrics'));
    this.objectives=new ObjectivePanel(document.querySelector('#objectives'));
    this.minimap=new Minimap(document.querySelector('#minimap'),game);
    this.debriefing=new MissionDebriefing(game,campaign,()=>window.__thermalShowCampaign?.(),level=>window.__thermalStartLevel?.(level));
    this.graph=document.querySelector('#history');this.graphCtx=this.graph.getContext('2d');
    this.bind();game.build.onChange=()=>{this.toolbar.render();if(game.build.selected)game.renderer.selectedEntity=null;};
  }

  bind(){
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
      this.game.renderer.mode=b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));
      document.querySelector('[data-thermal-scale]')?.classList.toggle('hidden',b.dataset.mode!=='thermal');
      const help=document.querySelector('#modeHelp');if(help)help.textContent=MODE_HELP[b.dataset.mode];
      const airflowModes=document.querySelector('#airflowModes');if(airflowModes)airflowModes.classList.toggle('hidden',b.dataset.mode!=='airflow');
    });
    document.querySelectorAll('[data-airflow-mode]').forEach(b=>b.onclick=()=>{
      this.game.renderer.airflow.setSubmode(b.dataset.airflowMode);
      document.querySelectorAll('[data-airflow-mode]').forEach(x=>x.classList.toggle('active',x===b));
      const help=document.querySelector('#modeHelp');
      if(help)help.textContent='Airflow · '+({vectors:'vetores locais',streamlines:'trajetórias RK2 contínuas',particles:'partículas seguindo o campo'}[b.dataset.airflowMode]||'campo de velocidade');
    });
    document.querySelector('#pauseBtn').onclick=()=>this.game.sim.togglePause();
    document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>this.game.setSpeed(Number(b.dataset.speed)));
    document.querySelector('#resetBtn').onclick=()=>window.__thermalStartLevel?.(this.game.level);
    document.querySelector('#exitBtn').onclick=()=>window.__thermalShowCampaign?.();
    document.querySelectorAll('[data-panel-toggle]').forEach(button=>button.onclick=()=>{
      const panel=document.querySelector('#'+button.dataset.panelToggle),expanded=button.getAttribute('aria-expanded')==='true';
      button.setAttribute('aria-expanded',String(!expanded));panel.classList.toggle('mobile-open',!expanded);
    });
    document.querySelector('[data-thermal-scale]')?.addEventListener('click',event=>{
      const renderer=this.game.renderer;renderer.thermalScaleMode=renderer.thermalScaleMode==='fixed'?'auto':'fixed';
      event.currentTarget.textContent=renderer.thermalScaleMode==='fixed'?'Escala fixa':'Escala automática';
      event.currentTarget.setAttribute('aria-pressed',String(renderer.thermalScaleMode==='fixed'));
    });
  }

  inspectAt(x,y){
    const e=this.game.world.entityAt(x,y)||this.game.world.utilityAt(x,y);
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
    document.querySelector('#rotateHint').textContent=DUCT_HINT(g);
    this.updateAlerts();this.drawGraph();
    if(s.mission.state!=='running')this.debriefing.show();
  }

  updateAlerts(){
    const root=document.querySelector('#alerts');if(!root)return;
    const s=this.game.sim,m=s.metrics,alerts=[],limit=this.game.level.powerLimit;
    if(m.maxTemp>=80)alerts.push(['critical','OVERHEAT','Equipamento em faixa crítica']);
    else if(m.maxTemp>50)alerts.push(['warn','HOTSPOT','Temperatura elevada detectada']);
    if(m.powerDraw>limit)alerts.push(['critical','POWER LIMIT','Limite de '+(limit/1000).toFixed(1)+' kW excedido']);
    const air=s.world.airDiagnostics;
    if(air?.maxDivergence>1.5)alerts.push(['warn','AIR SOLVER','Divergência elevada: '+air.maxDivergence.toFixed(2)]);

    const networks=s.fluid.networks||[];
    const badNetwork=networks.find(n=>n.entities.some(e=>e.type==='pump')&&!n.closed);
    if(badNetwork)alerts.push(['warn','FLUID '+badNetwork.status,badNetwork.id+' sem circulação válida']);
    else if(networks.some(n=>n.closed&&n.flowRate<.05))alerts.push(['warn','LOW FLOW','Circuito hidráulico com vazão insuficiente']);

    const hvac=s.hvac;
    const hvacIssue=hvac?.handlers.find(handler=>!['READY','DIRECT ROOM RETURN','OFF'].includes(handler.status));
    if(hvacIssue)alerts.push(['warn','HVAC '+hvacIssue.status,hvacIssue.name+' sem operação HVAC nominal']);
    if(hvac?.networks.some(network=>network.status==='READY'&&network.flowRate<.05))alerts.push(['warn','LOW HVAC FLOW','Rede HVAC conectada sem vazão suficiente']);
    if(hvac?.networks.some(network=>network.deadEnds?.length))alerts.push(['warn','DUCT DEAD END','Há trechos de duto sem saída conectada']);
    if(hvac?.networks.some(network=>network.pressure>180))alerts.push(['warn','DUCT PRESSURE HIGH','A rede está operando com perda de carga elevada']);
    const pressurizedZone=[...(s.world.hvacZonePressure||new Map())].find(([,pressure])=>Math.abs(pressure)>35);
    if(pressurizedZone)alerts.push(['warn','ROOM PRESSURE',pressurizedZone[1]>0?'Zona '+pressurizedZone[0]+' com pressão positiva elevada':'Zona '+pressurizedZone[0]+' com pressão negativa elevada']);
    if(hvac?.handlers.some(handler=>handler.currentFlow>0&&handler.supplyTemperature>20))alerts.push(['warn','SUPPLY AIR TOO WARM','Insuflação acima de 20°C']);
    const paired=hvac?.handlers.filter(handler=>handler.currentFlow>0)||[];
    if(paired.some(handler=>Math.abs(handler.flowImbalance||0)>.2))alerts.push(['warn','RETURN / SUPPLY IMBALANCE','Vazões de retorno e insuflação diferem']);
    const hotCondenser=hvac?.condensers.find(condenser=>condenser.indoor&&condenser.heatRejected>0);
    if(hotCondenser)alerts.push(['warn','CONDENSER HEAT RECIRCULATION','Condensadora rejeitando calor dentro da instalação']);
    if(hvac?.handlers.some(handler=>handler.status==='OVERLOAD'))alerts.push(['warn','AIR HANDLER OVERLOAD','Demanda de resfriamento supera capacidade disponível']);
    if(hvac?.condensers.some(condenser=>condenser.status==='HIGH LOAD'||condenser.status==='HIGH HEAD'))alerts.push(['warn','CONDENSER OVERLOAD','Condensadora próxima do limite de rejeição térmica']);

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
