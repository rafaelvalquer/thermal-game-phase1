import { Toolbar } from './Toolbar.js';
import { Inspector } from './Inspector.js';
import { MetricsPanel } from './MetricsPanel.js';
import { ObjectivePanel } from './ObjectivePanel.js';
import { Minimap } from './Minimap.js';
import { MissionDebriefing } from './MissionDebriefing.js';
import { DataCenterDashboard } from './DataCenterDashboard.js';

const MODE_HELP={
  normal:'Operação · zonas, equipamentos e efeitos físicos',
  thermal:'Térmico · 30°C atenção · 35°C quente · 40°C vermelho; confira a meta da fase',
  airflow:'Airflow · streamlines mostram trajetórias contínuas do campo de velocidade',
  pressure:'Pressão · azul negativa, vermelho positiva, cinza próximo de 0 Pa',
  fluid:'Fluido · temperatura, sentido e status de cada circuito',
  cooling:'Climatização · redes, capacidade, saídas e vazão de ar frio',
};
const DUCT_HINT=g=>{
  if(g.build.selected==='coolingUnit')return 'Modelo '+g.build.coolingUnitModel+' · M altera o modelo';
  if(g.build.selected==='duct')return 'Arraste para ligar dutos e criar ramificações · I alterna isolamento';
  if(g.build.selected&&['fan','exhaust','pump','supplyVent','coolingUnit'].includes(g.build.selected))return 'Direção: '+['→','↓','←','↑'][g.build.rotation]+' · R gira';
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
    this.datacenterDashboard=game.datacenter?new DataCenterDashboard(document.querySelector('#datacenterDashboard'),game.datacenter,message=>game.toast(message)):null;
    this.datacenterDashboardTimer=0;
    this.graph=document.querySelector('#history');this.graphCtx=this.graph.getContext('2d');
    if(game.level.thermalSystems?.simpleCooling){
      document.querySelector('[data-mode="pressure"]')?.classList.add('hidden');
      if(game.level.thermalSystems.waterCooling)document.querySelector('[data-mode="fluid"]')?.classList.remove('hidden');
      else document.querySelector('[data-mode="fluid"]')?.classList.add('hidden');
      document.querySelector('[data-mode="cooling"]')?.classList.remove('hidden');
    }else document.querySelector('[data-mode="cooling"]')?.classList.add('hidden');
    this.bind();game.build.onChange=()=>{this.toolbar.render();if(game.build.selected)game.renderer.selectedEntity=null;};
  }

  bind(){
    document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
      this.game.renderer.mode=b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));
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
    document.querySelector('#resetBtn').onclick=()=>window.__thermalStartLevel?.(this.game.level,this.game.datacenter?{fresh:true}:undefined);
    document.querySelector('#exitBtn').onclick=()=>window.__thermalShowCampaign?.();
    document.querySelectorAll('[data-panel-toggle]').forEach(button=>button.onclick=()=>{
      const panel=document.querySelector('#'+button.dataset.panelToggle),expanded=button.getAttribute('aria-expanded')==='true';
      button.setAttribute('aria-expanded',String(!expanded));panel.classList.toggle('mobile-open',!expanded);
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
    if(this.datacenterDashboard){this.datacenterDashboardTimer+=dt;if(this.datacenterDashboardTimer>=.35){this.datacenterDashboardTimer=0;this.datacenterDashboard.update();}}
    document.querySelector('#clock').textContent=g.datacenter?g.datacenter.clock.format():this.formatTime(s.elapsed);
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
    const maxAirTemp=m.maxAirTemp??m.maxTemp??0,maxMachineTemp=m.maxMachineTemp??0;
    if(maxAirTemp>=80)alerts.push(['critical','AR CRÍTICO','Ar ambiente em faixa crítica: '+maxAirTemp.toFixed(1)+' °C']);
    else if(maxAirTemp>50)alerts.push(['warn','AR QUENTE','Temperatura do ar elevada: '+maxAirTemp.toFixed(1)+' °C']);
    if(maxMachineTemp>=80)alerts.push(['critical','MÁQUINA SUPERAQUECIDA','Equipamento em faixa crítica: '+maxMachineTemp.toFixed(1)+' °C']);
    else if(maxMachineTemp>50)alerts.push(['warn','MÁQUINA QUENTE','Temperatura do equipamento elevada: '+maxMachineTemp.toFixed(1)+' °C']);
    const slaIssue=this.game.datacenter?.state.contracts.find(contract=>contract.dailyViolation||contract.lastSlaViolationDay===this.game.datacenter.clock.day);
    if(slaIssue)alerts.push(['critical','SLA VIOLADO',slaIssue.clientName+' · disponibilidade ou temperatura fora do contrato.']);
    if(m.powerDraw>limit)alerts.push(['critical','POWER LIMIT','Limite de '+(limit/1000).toFixed(1)+' kW excedido']);
    const air=s.world.airDiagnostics;
    if(air?.maxDivergence>1.5)alerts.push(['warn','AIR SOLVER','Divergência elevada: '+air.maxDivergence.toFixed(2)]);

    const networks=s.fluid?.networks||[];
    const badNetwork=networks.find(n=>n.entities.some(e=>e.type==='pump')&&!n.closed);
    if(badNetwork)alerts.push(['warn','FLUID '+badNetwork.status,badNetwork.id+' sem circulação válida']);
    else if(networks.some(n=>n.closed&&n.flowRate<.05))alerts.push(['warn','LOW FLOW','Circuito hidráulico com vazão insuficiente']);


    const cooling=s.cooling;
    if(cooling?.units.some(unit=>unit.status==='OVERLOAD'))alerts.push(['warn','REFRIGERAÇÃO SOBRECARREGADA','Adicione capacidade ou reduza a carga térmica.']);
    if(cooling?.units.some(unit=>unit.indoor&&unit.heatRejected>0))alerts.push(['warn','CALOR NA SALA','Uma condensadora interna devolve calor ao ambiente onde está instalada.']);
    if(cooling?.networks.some(network=>network.status==='MULTIPLE COOLING UNITS'))alerts.push(['warn','REDE COMPARTILHADA','Uma rede de dutos não pode atender duas condensadoras.']);
    if(cooling?.units.some(unit=>unit.enabled&&unit.status==='DISCONNECTED'))alerts.push(['warn','SEM SAÍDA DE FRIO','Conecte a condensadora a dutos e a uma saída de ar gelado.']);

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
