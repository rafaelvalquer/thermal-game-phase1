import { Toolbar } from './Toolbar.js';
import { Inspector } from './Inspector.js';
import { MetricsPanel } from './MetricsPanel.js';
import { ObjectivePanel } from './ObjectivePanel.js';
import { Minimap } from './Minimap.js';
import { MissionDebriefing } from './MissionDebriefing.js';
import { DataCenterDashboard } from './DataCenterDashboard.js';
import { formatPower } from '../utils/MathUtils.js';
import { isPowered, powerEquipment } from '../simulation/PowerState.js';
import { technicianAt } from '../entities/Technician.js';
import { UIScheduler } from './UIScheduler.js';

const MODE_HELP={
  normal:'Operação · zonas, equipamentos e efeitos físicos',
  thermal:'Térmico · 30°C atenção · 35°C quente · 40°C vermelho; confira a meta da fase',
  airflow:'Airflow · streamlines mostram trajetórias contínuas do campo de velocidade',
  pressure:'Pressão · azul negativa, vermelho positiva, cinza próximo de 0 Pa',
  fluid:'Fluido · temperatura, sentido e status de cada circuito',
  cooling:'Climatização · redes, capacidade, saídas e vazão de ar frio',
};
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const DUCT_HINT=g=>{
  if(g.build.selected==='serverRack'){const d=g.build.direction(),glyph=d.x>0?'→':d.x<0?'←':d.y>0?'↓':'↑';return 'Entrada fria '+glyph+' · saída quente no lado oposto · R gira';}
  if(g.build.selected==='coolingUnit')return 'Modelo '+g.build.coolingUnitModel+' · M altera o modelo';
  if(g.build.selected==='industrialCoolingUnit')return 'Industrial · 50 kW · 2 tiles · R gira a descarga';
  if(g.build.selected==='duct')return 'Arraste para ligar dutos e criar ramificações · I alterna isolamento';
  if(g.build.selected&&['fan','exhaust','pump','supplyVent','coolingUnit','industrialCoolingUnit'].includes(g.build.selected))return 'Direção: '+['→','↓','←','↑'][g.build.rotation]+' · R gira';
  return '';
};

export class UIManager {
  constructor(game,campaign){
    this.game=game;this.campaign=campaign;
    this.toolbar=new Toolbar(document.querySelector('#tools'),game.build);
    this.inspector=new Inspector(document.querySelector('#inspector'));
    this.inspector.onPowerToggle=entity=>this.togglePower(entity);
    this.metrics=new MetricsPanel(document.querySelector('#metrics'));
    this.objectives=new ObjectivePanel(document.querySelector('#objectives'));
    this.minimap=new Minimap(document.querySelector('#minimap'),game);
    this.debriefing=new MissionDebriefing(game,campaign,()=>window.__thermalShowCampaign?.(),level=>window.__thermalStartLevel?.(level));
    this.datacenterDashboard=game.datacenter?new DataCenterDashboard(document.querySelector('#datacenterDashboard'),game.datacenter,message=>game.toast(message),()=>this.openDailyReport(true),(contractId,racks,focus)=>this.selectContractRacks(contractId,racks,focus),()=>this.forceDatacenterUiRefresh()):null;
    this.datacenterDashboardTimer=0;
    this.staffPanelTimer=0;this.staffPanelHtml='';
    this.uiScheduler=new UIScheduler();this.forceUiRefresh=new Set(['inspector','metrics','alerts','staff','datacenterDashboard','graphs','objectives']);
    this.reportRoot=document.querySelector('#dailyReport');this.reportManual=false;this.resumeAfterReport=false;this.reportShownDay=null;
    this.expansionModalOfferId=null;this.resumeAfterExpansionOffer=false;
    this.graph=document.querySelector('#history');this.graphCtx=this.graph.getContext('2d');
    this.powerGraph=document.querySelector('#powerHistory');this.powerGraphCtx=this.powerGraph.getContext('2d');
    if(game.level.thermalSystems?.simpleCooling){
      document.querySelector('[data-mode="pressure"]')?.classList.add('hidden');
      if(game.level.thermalSystems.waterCooling)document.querySelector('[data-mode="fluid"]')?.classList.remove('hidden');
      else document.querySelector('[data-mode="fluid"]')?.classList.add('hidden');
      document.querySelector('[data-mode="cooling"]')?.classList.remove('hidden');
    }else document.querySelector('[data-mode="cooling"]')?.classList.add('hidden');
    this.bind();game.build.onChange=()=>{this.toolbar.render();if(game.build.selected)game.renderer.selectedEntity=null;};
    document.querySelector('#staffPanel')?.addEventListener('click',event=>{
      const hire=event.target.closest('[data-hire-tech]');if(hire){const result=game.staff.hire();game.toast(result.ok?'Técnico contratado. Salário diário: '+this.money(250)+'.':result.reason);this.staffPanelHtml='';this.updateStaffPanel();return;}
      const fire=event.target.closest('[data-fire-tech]');if(fire&&game.staff.fire(fire.dataset.fireTech)){game.toast('Técnico desligado.');this.staffPanelHtml='';this.updateStaffPanel();}
      const select=event.target.closest('[data-select-tech]');if(select){const worker=game.staff.workers.find(item=>String(item.id)===select.dataset.selectTech);if(worker)this.inspectEntity(worker);}
    });
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
    this.reportRoot?.addEventListener('click',event=>{if(event.target===this.reportRoot)this.closeDailyReport();});
    this.reportRoot?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closeDailyReport();}if(event.key==='Tab')this.trapReportFocus(event);});
    addEventListener('keydown',event=>{if(event.key==='Escape'&&!this.reportRoot?.hidden){event.preventDefault();this.closeDailyReport();}});
    document.querySelectorAll('[data-panel-toggle]').forEach(button=>button.onclick=()=>{
      const panel=document.querySelector('#'+button.dataset.panelToggle),expanded=button.getAttribute('aria-expanded')==='true';
      button.setAttribute('aria-expanded',String(!expanded));panel.classList.toggle('mobile-open',!expanded);
    });
  }

  inspectAt(x,y){
    const e=technicianAt(this.game.world,x,y)||this.game.world.entityAt(x,y)||this.game.world.utilityAt(x,y);
    this.inspectEntity(e,x,y);
  }

  inspectEntity(entity,x=0,y=0){
    const e=entity&&this.game.world.entities.includes(entity)?entity:null;
    this.inspector.setTarget(e?{kind:'entity',entity:e}:{kind:'tile',x,y});this.forceUiRefresh?.add('inspector');
    this.game.renderer.selectedEntity=e||null;
  }

  forceDatacenterUiRefresh(){for(const key of ['metrics','alerts','staff','datacenterDashboard','graphs','objectives','inspector']){this.forceUiRefresh?.add(key);this.activeDue?.add(key);}}

  criticalAlertSignature(){
    const {sim,datacenter}=this.game,m=sim.metrics,alerts=[];
    if((m.maxAirTemp??m.maxTemp??0)>=80)alerts.push('air');
    if((m.maxMachineTemp||0)>=80)alerts.push('machine');
    if(datacenter){
      const grid=datacenter.powerGrid;
      if(grid.breakerOpen)alerts.push('breaker');if(grid.blockedRacks)alerts.push('blocked:'+grid.blockedRacks);if(grid.overloadSeconds>0)alerts.push('overload');
      for(const contract of datacenter.state.contracts)if(contract.dailyViolation||contract.lastSlaViolationDay===datacenter.clock.day)alerts.push('sla:'+contract.id);
    }else if(m.powerDraw>this.game.level.powerLimit)alerts.push('power');
    return alerts.join('|');
  }

  selectContractRacks(contractId,racks=[],focus=false){
    const {renderer,camera,canvas}=this.game;
    renderer.highlightedContractId=contractId||null;
    if(!focus||!racks.length)return;
    const tile=renderer.tile,minX=Math.min(...racks.map(rack=>rack.x)),maxX=Math.max(...racks.map(rack=>rack.x)),minY=Math.min(...racks.map(rack=>rack.y)),maxY=Math.max(...racks.map(rack=>rack.y));
    const padding=tile*2,worldX=(minX+maxX+1)*tile/2,worldY=(minY+maxY+1)*tile/2;
    const rect=canvas.getBoundingClientRect(),frameWidth=(maxX-minX+1)*tile+padding*2,frameHeight=(maxY-minY+1)*tile+padding*2;
    const fit=Math.min(rect.width/frameWidth,rect.height/frameHeight);
    camera.zoom=Math.max(camera.minZoom,Math.min(1.6,fit*.9));
    camera.x=worldX-rect.width/(2*camera.zoom);camera.y=worldY-rect.height/(2*camera.zoom);
    camera.constrain(rect.width,rect.height);
  }

  togglePower(entity){
    if(entity.type==='serverRack'&&entity.status==='CANCELLED')return;
    entity.enabled=!entity.enabled;
    const {sim,world,datacenter}=this.game;
    if(datacenter)datacenter.protectPower(0);
    else sim.cooling?.update(0,{prepareOnly:true});
    if(!datacenter)sim.batteryDispatch?.dispatch(this.game.level.powerLimit,0);
    sim.fluid?.update(0);
    sim.airflow?.fans.updateAllDiagnostics();
    sim.metrics.powerDraw=sim.batteryDispatch
      ?sim.batteryDispatch.currentGridPowerW({breakerOpen:Boolean(datacenter?.powerGrid?.breakerOpen)})
      :[...powerEquipment(world)].reduce((sum,item)=>sum+(isPowered(item)?item.power||0:0),0);
    if(datacenter)datacenter.persist();
    for(const key of ['metrics','alerts','datacenterDashboard','graphs','inspector'])this.forceUiRefresh?.add(key);
    this.inspector.update(world);
    this.game.toast((entity.enabled?'Ligado: ':'Desligado: ')+(entity.name||entity.type));
  }

  update(dt=0){
    const g=this.game,s=g.sim,critical=this.criticalAlertSignature();
    if(critical!==this.lastCriticalAlertSignature){this.forceUiRefresh?.add('alerts');this.lastCriticalAlertSignature=critical;}
    const due=new Set([...this.uiScheduler.update(dt),...this.forceUiRefresh]);this.forceUiRefresh.clear();
    this.activeDue=due;
    const budget=document.querySelector('#budgetValue');if(budget)budget.textContent=(g.datacenter?'R$ ':'$ ')+Math.floor(g.build.budget).toLocaleString('pt-BR');
    if(due.has('metrics'))this.metrics.update(s,g.build,g.level);if(due.has('objectives'))this.objectives.update(s);if(due.has('inspector'))this.inspector.update(g.world);if(due.has('minimap'))this.minimap.update(.2);
    if(due.has('staff'))this.updateStaffPanel();
    if(this.datacenterDashboard&&due.has('datacenterDashboard'))this.datacenterDashboard.update();
    if(g.datacenter){
      const dc=g.datacenter;
      const pendingBefore=Boolean(dc.state.reportPending),offerVersion=dc.state.marketGeneratedVersion||0,reputation=dc.state.reputation;
      if(dc.state.reportPending&&this.reportShownDay!==dc.state.dailyResult?.day)this.openDailyReport(false);
      const notification=dc.consumeNotification();
      if(notification){const expenses=notification.energyCost+notification.fixedPowerCost+notification.coolingMaintenance+notification.penalties+(notification.staffPayroll||0),tierSuffix=notification.reputation?.tierChanged?' · reputação alterada para '+notification.reputation.tierEnd:'';this.game.toast('DIA '+(notification.day+1)+' · +'+(notification.newOffers?.length||0)+' oportunidades · receita '+this.money(notification.revenue)+' · custos '+this.money(expenses)+' · lucro '+this.money(notification.net)+tierSuffix);this.forceDatacenterUiRefresh();if(notification.reputation?.tierChanged)dc.state.reputationTierNotification=null;}
      if(dc.state.reputationTierNotification&&!dc.state.reportPending){const tier=dc.state.reputationTierNotification;dc.state.reputationTierNotification=null;this.game.toast('Nível de reputação alterado: '+tier.oldTier+' → '+tier.newTier+'.');dc.persist();this.forceDatacenterUiRefresh();}
      this.updateExpansionOfferModal();
      if((!pendingBefore&&dc.state.reportPending)||offerVersion!==(dc.state.marketGeneratedVersion||0)||reputation!==dc.state.reputation)
        this.forceDatacenterUiRefresh();
    }
    if(due.has('clock'))document.querySelector('#clock').textContent=g.datacenter?g.datacenter.clock.format():this.formatTime(s.elapsed);
    if(due.has('objectives'))document.querySelector('#missionText').textContent=s.mission.message;
    document.querySelector('#pauseBtn').textContent=s.paused?'▶ Continuar':'Ⅱ Pausar';
    document.querySelector('#speedLabel').textContent=s.speed+'×';
    document.querySelector('#rotateHint').textContent=DUCT_HINT(g);
    if(due.has('alerts'))this.updateAlerts();if(due.has('graphs')){g.performance?.begin?.('uiGraphMs');try{this.drawGraph();}finally{g.performance?.end?.('uiGraphMs');}}
    if(s.mission.state!=='running')this.debriefing.show();
    this.activeDue=null;
  }

  money(value){return (this.game.datacenter?'R$ ':'$ ')+Math.round(Number(value)||0).toLocaleString('pt-BR');}
  dailyContractRate(monthlyValue){return (this.game.datacenter?'R$ ':'$ ')+((Number(monthlyValue)||0)/30).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
  updateStaffPanel(){
    const root=document.querySelector('#staffPanel'),staff=this.game.staff;if(!root||!staff)return;
    const racks=this.game.world.entitiesByType('serverRack').length;if(!racks){if(this.staffPanelHtml){root.innerHTML='';this.staffPanelHtml='';}return;}
    const workers=staff.workers,cap=staff.maxWorkers,payroll=staff.payroll;
    const cards=workers.map((worker,index)=>{const rack=this.game.world.getEntityById(worker.targetRackId),rackName=escapeHtml(rack?.name||'rack');let detail='Em patrulha';if(worker.action==='working')detail='Atendendo '+rackName+' · troca térmica +20% · '+Math.max(0,worker.boostRemaining||0).toFixed(1)+' s · '+Math.round((worker.workProgress||0)*100)+'%';else if(worker.action==='moving')detail='A caminho de '+rackName;else if(worker.action==='cooldown')detail='Intervalo · próximo atendimento em '+Math.max(0,worker.cooldownRemaining||0).toFixed(1)+' s';return '<div class="staff-row"><button type="button" class="staff-select" data-select-tech="'+worker.id+'" aria-label="Inspecionar técnico '+(index+1)+'"><i class="staff-led '+(worker.targetRackId?'active':'')+'"></i><b>Técnico '+String(index+1).padStart(2,'0')+'</b><small>'+detail+'</small>'+(worker.action==='working'?'<span class="staff-work-progress" role="progressbar" aria-label="Progresso do atendimento" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round((worker.workProgress||0)*100)+'"><i style="width:'+Math.round((worker.workProgress||0)*100)+'%"></i></span>':'')+'</button><button data-fire-tech="'+worker.id+'" aria-label="Desligar técnico '+(index+1)+'">×</button></div>';}).join('');
    const html='<section class="staff-card"><div class="staff-head"><span>EQUIPE TÉCNICA</span><b>'+workers.length+' / '+cap+'</b></div><p>Patrulha automática · identifica racks acima de 35 °C ou do SLA e melhora temporariamente a troca térmica.</p>'+cards+'<div class="staff-footer"><span>Salários <b>'+this.money(payroll)+'/dia</b></span><button data-hire-tech '+(workers.length>=cap||this.game.build.budget<2000?'disabled':'')+'>Contratar · '+this.money(2000)+'</button></div></section>';
    if(html!==this.staffPanelHtml){const active=document.activeElement,focused=root.contains(active)?active.dataset.fireTech||active.dataset.hireTech||active.dataset.selectTech:null,selector=active?.dataset.fireTech!=null?`[data-fire-tech="${focused}"]`:active?.dataset.hireTech!=null?'[data-hire-tech]':`[data-select-tech="${focused}"]`;root.innerHTML=html;this.staffPanelHtml=html;if(focused!=null)root.querySelector(selector)?.focus();}
  }
  openDailyReport(manual=false){
    const dc=this.game.datacenter,result=dc?.state.dailyResult;if(!dc||!result||!this.reportRoot)return;
    this.reportManual=manual;this.resumeAfterReport=manual?this.game.sim.paused:false;this.reportShownDay=result.day;
    if(result.reputation?.tierChanged)dc.state.reputationTierNotification=null;
    this.game.sim.paused=true;
    const opportunities=result.newOffers||[],operations=result.operations||{},sla=result.sla||{operatingCount:0,violations:[]};
    const reputation=result.reputation;
    const rows=[['Receita',result.revenue],['Energia',-result.energyCost],['Contrato elétrico',-result.fixedPowerCost],['Manutenção',-result.coolingMaintenance],['Equipe técnica',-(result.staffPayroll||0)],['Multas SLA',-result.penalties]];
    const finance=rows.map(([name,value],index)=>{const expense=index>0;return '<div><span>'+name+'</span><b class="'+(expense?'negative':'positive')+'">'+(expense?'−':'+')+this.money(Math.abs(value))+'</b></div>';}).join('');
    const slaText=sla.violations?.length?'<ul>'+sla.violations.map(item=>'<li>'+item.clientName+'</li>').join('')+'</ul>':sla.operatingCount?'✓ Todos cumpridos':'Sem contratos em operação';
    const offers=opportunities.length?opportunities.map(offer=>'<article><b>'+escapeHtml(offer.clientName)+(offer.renewalContractId?' · RENOVAÇÃO':'')+'</b><span>'+offer.rackCount+' racks · '+this.managerKw(offer.rackCount*offer.powerPerRackKW)+' · '+this.dailyContractRate(offer.monthlyFee)+'/dia</span><small>'+(offer.locked?'Exige reputação '+offer.requiredReputation:'Expira em '+(offer.expiresDay-offer.offeredDay)+' dias')+'</small></article>').join(''):'<p>Nenhum contrato chegou neste dia.</p>';
    const reputationSummary=reputation?'<h3>Reputação</h3><div class="report-reputation"><b>'+reputation.tierStart+' → '+reputation.tierEnd+'</b><span>'+reputation.start.toFixed(0)+' → '+reputation.end.toFixed(0)+' pontos ('+(reputation.change>0?'+':'')+reputation.change.toFixed(2)+')</span>'+(reputation.tierChanged?'<strong>Você alcançou o nível '+reputation.tierEnd+'. As novas condições já aparecem no mercado.</strong>':'')+'</div>':'';
    this.reportRoot.innerHTML='<section class="daily-report" role="dialog" aria-modal="true" aria-labelledby="dailyReportTitle"><button class="daily-report-close" data-report-close aria-label="Fechar relatório">×</button><p class="eyebrow">FECHAMENTO OPERACIONAL</p><h2 id="dailyReportTitle">RELATÓRIO — DIA '+result.day+'</h2>'+(operations.partial?'<p class="report-partial">Dados operacionais parciais neste primeiro relatório.</p>':'')+'<h3>Financeiro</h3><div class="report-finance">'+finance+'<div class="report-net"><span>Resultado</span><b class="'+(result.net<0?'negative':'positive')+'">'+(result.net<0?'−':'+')+this.money(Math.abs(result.net))+'</b></div></div><h3>Operação</h3><div class="report-kpis"><div><span>Potência média</span><b>'+(operations.averagePowerKW==null?'—':this.managerKw(operations.averagePowerKW))+'</b></div><div><span>Pico</span><b>'+(operations.peakPowerKW==null?'—':this.managerKw(operations.peakPowerKW))+'</b></div><div><span>PUE</span><b>'+(operations.pue==null?'—':operations.pue.toFixed(2))+'</b></div><div><span>Temperatura máxima</span><b>'+(operations.maxAirTemperature==null?'—':operations.maxAirTemperature.toFixed(1)+' °C')+'</b></div></div>'+reputationSummary+'<h3>SLA</h3><div class="report-sla">'+slaText+'</div><h3>Novas oportunidades · Dia '+(result.day+1)+'</h3><div class="report-offers">'+offers+'</div><label class="report-pause"><input type="checkbox" data-report-pause '+(dc.state.pauseOnNewContracts?'checked':'')+'> Pausar quando novos contratos chegarem</label><footer>'+(manual?'<button data-report-close>Fechar relatório</button>':'<button data-view-contracts>Ver contratos</button><button class="primary" data-start-day>Iniciar dia '+(result.day+1)+'</button>')+'</footer></section>';
    this.reportRoot.hidden=false;
    dc.markOffersSeen(opportunities.map(offer=>offer.id));
    this.reportRoot.querySelector('[data-report-pause]')?.addEventListener('change',event=>dc.setPauseOnNewContracts(event.target.checked));
    this.reportRoot.querySelectorAll('[data-report-close]').forEach(button=>button.addEventListener('click',()=>this.closeDailyReport()));
    this.reportRoot.querySelector('[data-view-contracts]')?.addEventListener('click',()=>{dc.dismissReport();this.closeDailyReport({keepPaused:true,scrollMarket:true});});
    this.reportRoot.querySelector('[data-start-day]')?.addEventListener('click',()=>{dc.dismissReport();this.closeDailyReport({resume:true});});
    this.reportRoot.querySelector('[data-report-close]')?.focus();
  }
  updateExpansionOfferModal(){
    const dc=this.game.datacenter,offer=dc?.state.pendingExpansionOffer;
    if(!offer||dc.state.reportPending||!this.reportRoot||!this.reportRoot.hidden||this.expansionModalOfferId===offer.id)return;
    this.resumeAfterExpansionOffer=this.game.sim.paused;this.game.sim.paused=true;this.expansionModalOfferId=offer.id;
    const currentExpiry='Dia '+offer.currentExpiresDay,proposedExpiry='Dia '+offer.expiresDay;
    const extraRacks=offer.rackCount-offer.currentRackCount,description=offer.expansionType==='racks'?'A expansão inclui '+extraRacks+(extraRacks===1?' rack adicional':' racks adicionais')+', que poderão ser instalados pelo fluxo normal.':'A expansão aumenta a potência máxima de cada rack existente e dos próximos racks instalados.';
    this.reportRoot.innerHTML='<section class="daily-report expansion-report" role="dialog" aria-modal="true" aria-labelledby="expansionTitle"><p class="eyebrow">CONVITE DE EXPANSÃO</p><h2 id="expansionTitle">'+escapeHtml(offer.clientName)+' propõe um aditivo</h2><p class="expansion-intro">'+description+' A taxa de instalação será paga no aceite.</p><div class="expansion-terms"><div><span>Racks</span><b>'+offer.currentRackCount+' → '+offer.rackCount+'</b></div><div><span>Potência por rack</span><b>'+this.managerKw(offer.currentPowerPerRackKW)+' → '+this.managerKw(offer.powerPerRackKW)+'</b></div><div><span>Capacidade contratada</span><b>'+this.managerKw(offer.currentCapacityKW)+' → '+this.managerKw(offer.capacityKW)+'</b></div><div><span>Pagamento diário</span><b>'+this.dailyContractRate(offer.currentMonthlyFee)+' → '+this.dailyContractRate(offer.monthlyFee)+' <small>(+'+this.dailyContractRate(offer.monthlyIncrease)+'/dia)</small></b></div><div><span>Taxa de instalação</span><b>'+this.money(offer.installationFee)+'</b></div><div><span>Vencimento</span><b>'+currentExpiry+' → '+proposedExpiry+'</b></div></div><footer><button type="button" data-expansion-decision="decline">Recusar</button><button type="button" class="primary" data-expansion-decision="accept">Aceitar aditivo</button></footer></section>';
    this.reportRoot.hidden=false;
    this.reportRoot.querySelectorAll('[data-expansion-decision]').forEach(button=>button.addEventListener('click',()=>this.respondToExpansionOffer(button.dataset.expansionDecision==='accept')));
    this.reportRoot.querySelector('[data-expansion-decision="accept"]')?.focus();
  }
  respondToExpansionOffer(accept){
    const result=this.game.datacenter.respondToExpansionOffer(accept),offerId=this.expansionModalOfferId;
    this.expansionModalOfferId=null;
    if(this.reportRoot){this.reportRoot.hidden=true;this.reportRoot.innerHTML='';}
    this.game.sim.paused=this.resumeAfterExpansionOffer;
    if(result.ok)this.game.toast(result.accepted?'Aditivo aceito: '+result.contract.clientName+' · '+result.contract.rackCount+' racks contratados.':'Proposta de expansão recusada.');
    else this.game.toast(result.reason||'Não foi possível responder à proposta.');
    return {...result,offerId};
  }
  managerKw(value){return (Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kW';}
  closeDailyReport({resume=false,keepPaused=false,scrollMarket=false}={}){
    if(!this.reportRoot||this.reportRoot.hidden||this.expansionModalOfferId)return;
    const wasManual=this.reportManual;this.reportRoot.hidden=true;this.reportRoot.innerHTML='';
    if(!wasManual&&this.game.datacenter?.state.reportPending)this.game.datacenter.dismissReport();
    if(resume)this.game.sim.paused=false;
    else if(wasManual&&!keepPaused)this.game.sim.paused=this.resumeAfterReport;
    if(scrollMarket){document.querySelector('#dc-market')?.scrollIntoView({behavior:'smooth',block:'start'});}
  }
  trapReportFocus(event){
    const controls=[...this.reportRoot.querySelectorAll('button,input,[href],select,[tabindex]:not([tabindex="-1"])')].filter(item=>!item.disabled);
    if(!controls.length)return;const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
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
    const grid=this.game.datacenter?.powerGrid;
    if(grid?.breakerOpen)alerts.push(['critical','DISJUNTOR GERAL','Instalação sem energia. Reduza a carga ou amplie a rede e rearme.']);
    else if(grid?.blockedRacks)alerts.push(['critical','CORTE SELETIVO',grid.blockedRacks+' racks sem energia. Rearme após liberar capacidade.']);
    if(grid?.overloadSeconds>0)alerts.push(['critical','SOBRECARGA','Corte em '+grid.remainingSeconds.toFixed(1)+' s de simulação física.']);
    else if(grid?.status==='ALERTA')alerts.push(['warn','ALERTA ELÉTRICO','Consumo entre 90% e 100% da capacidade.']);
    if(!grid&&m.powerDraw>limit)alerts.push(['critical','POWER LIMIT','Limite de '+(limit/1000).toFixed(1)+' kW excedido']);
    const air=s.world.airDiagnostics;
    if(air?.maxDivergence>1.5)alerts.push(['warn','AIR SOLVER','Divergência elevada: '+air.maxDivergence.toFixed(2)]);

    const networks=s.fluid?.networks||[];
    const badNetwork=networks.find(n=>n.entities.some(e=>e.type==='pump')&&!n.closed);
    if(badNetwork)alerts.push(['warn','FLUID '+badNetwork.status,badNetwork.id+' sem circulação válida']);
    else if(networks.some(n=>n.closed&&n.flowRate<.05))alerts.push(['warn','LOW FLOW','Circuito hidráulico com vazão insuficiente']);
    if(networks.some(n=>n.closed&&n.entities.some(e=>e.type==='exchanger')&&!n.entities.some(e=>e.type==='radiator')))
      alerts.unshift(['warn','ÁGUA SEM REJEIÇÃO','Instale um radiador no circuito para dissipar o calor captado pela água.']);


    const cooling=s.cooling;
    if(cooling?.units.some(unit=>unit.status==='OVERLOAD'))alerts.push(['warn','REFRIGERAÇÃO SOBRECARREGADA','Adicione capacidade ou reduza a carga térmica.']);
    if(cooling?.units.some(unit=>unit.indoor&&unit.heatRejected>0))alerts.push(['warn','CALOR NA SALA','Uma condensadora interna devolve calor ao ambiente onde está instalada.']);
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
    const data=this.game.sim.history;if(data.length<2){this.drawPowerGraph();return;}
    const min=20,max=Math.max(85,...data.map(d=>Math.min(d.max,120)));
    const draw=(key,stroke,width)=>{ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.beginPath();data.forEach((d,i)=>{const value=Math.min(d[key],max),x=i/(data.length-1)*W,y=H-(value-min)/(max-min)*H;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
    draw('max','#fb7185',2);draw('avg','#67e8f9',1.5);
    const safe=this.safeLine(),safeY=H-(safe-min)/(max-min)*H;ctx.strokeStyle='rgba(250,204,21,.35)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(0,safeY);ctx.lineTo(W,safeY);ctx.stroke();ctx.setLineDash([]);
    this.drawPowerGraph();
  }

  drawPowerGraph(){
    const c=this.powerGraph,ctx=this.powerGraphCtx,r=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.max(10,Math.floor(r.width*dpr)),h=Math.max(10,Math.floor(r.height*dpr));
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);const W=w/dpr,H=h/dpr;
    ctx.clearRect(0,0,W,H);ctx.strokeStyle='rgba(148,163,184,.12)';ctx.lineWidth=1;
    for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,H*i/4);ctx.lineTo(W,H*i/4);ctx.stroke();}
    const limit=this.game.level.powerLimit||0,data=this.game.sim.history;
    const peak=Math.max(limit,...data.map(item=>item.power||0),...data.map(item=>item.batteryDischargeW||0),...data.map(item=>item.solarGenerationW||0),1000),max=peak*1.12;
    const batteries=this.game.world.entitiesByType('battery'),stored=batteries.reduce((sum,battery)=>sum+(battery.storedEnergyJ||0)/3_600_000,0),capacity=batteries.reduce((sum,battery)=>sum+(battery.capacityJ||0)/3_600_000,0);
    const discharge=batteries.reduce((sum,battery)=>sum+(battery.enabled?battery.dischargePowerW||0:0),0),charge=batteries.reduce((sum,battery)=>sum+(battery.enabled?battery.chargePowerW||0:0),0);
    const summary=document.querySelector('#powerSummary');if(summary){
      const flow=discharge>0?' · USANDO '+formatPower(discharge):charge>0?' · CARGA '+formatPower(charge):'';
      const solar=this.game.sim.metrics.solarGenerationW||0;
      summary.textContent='Rede '+formatPower(this.game.sim.metrics.powerDraw||0)+' / '+formatPower(limit)+' · Solar '+formatPower(solar)+' · Bat '+stored.toFixed(1)+'/'+capacity.toFixed(0)+' kWh'+flow;
      summary.title='Geração solar: '+formatPower(solar)+'. Energia armazenada: '+stored.toFixed(2)+' de '+capacity.toFixed(2)+' kWh. Potência fornecida pela bateria: '+formatPower(discharge)+'. Potência de carga: '+formatPower(charge)+'.';
    }
    const plotW=Math.max(1,W-(capacity>0?28:0)),limitY=H-limit/max*H;ctx.strokeStyle='rgba(251,191,36,.82)';ctx.lineWidth=1.3;ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(0,limitY);ctx.lineTo(plotW,limitY);ctx.stroke();ctx.setLineDash([]);
    if(data.length<2)return;
    const drawPowerSeries=(key,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();data.forEach((item,index)=>{const x=index/(data.length-1)*plotW,y=H-(Math.min(item[key]||0,max)/max)*H;index?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();};
    drawPowerSeries('power','#67e8f9',1.7);
    drawPowerSeries('solarGenerationW','#fbbf24',1.7);
    const batteryScale=Math.max(0,...data.map(item=>item.batteryCapacityKWh||0));
    if(batteryScale>0||capacity>0)drawPowerSeries('batteryDischargeW','#fb923c',1.8);
    if(batteryScale>0){
      ctx.beginPath();data.forEach((item,index)=>{const x=index/(data.length-1)*plotW,ratio=Math.max(0,Math.min(1,(item.batteryStoredKWh||0)/batteryScale)),y=H-ratio*H;index?ctx.lineTo(x,y):ctx.moveTo(x,y);});
      ctx.lineTo(plotW,H);ctx.lineTo(0,H);ctx.closePath();ctx.fillStyle='rgba(167,139,250,.10)';ctx.fill();
      ctx.strokeStyle='#a78bfa';ctx.lineWidth=1.5;ctx.beginPath();data.forEach((item,index)=>{const x=index/(data.length-1)*plotW,ratio=Math.max(0,Math.min(1,(item.batteryStoredKWh||0)/batteryScale)),y=H-ratio*H;index?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
      ctx.fillStyle='rgba(196,181,253,.8)';ctx.font='6px ui-monospace,monospace';ctx.textAlign='right';ctx.textBaseline='top';ctx.fillText(batteryScale.toFixed(0)+' kWh',W-1,1);ctx.textBaseline='bottom';ctx.fillText('0',W-1,H-1);
    }
  }
}
