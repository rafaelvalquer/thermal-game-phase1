import { offerDisplayState, offerExpiryLabel } from '../datacenter/ContractDefinitions.js';
import { POWER_INSTALL_COST_PER_KW, POWER_MONTHLY_COST_PER_KW } from '../datacenter/PowerGridSystem.js';
import { REPUTATION_TIERS, reputationPriceMultiplier } from '../datacenter/ReputationDefinitions.js';

const money=value=>'R$ '+Math.round(Number(value)||0).toLocaleString('pt-BR');
const dailyMoney=value=>'R$ '+((Number(value)||0)/30).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const kw=value=>(Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kW';
const tariff=value=>'R$ '+(Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const unitRate=value=>'R$ '+Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=value=>Math.max(0,Math.min(100,Number(value)||0));
const statusLabel=status=>({installing:'INSTALAÇÃO',active:'EM OPERAÇÃO',completed:'CONCLUÍDO',cancelled:'ENCERRADO'})[status]||status.toUpperCase();
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export class DataCenterDashboard {
  constructor(root,manager,onMessage=()=>{},onOpenReport=()=>{},onContractSelection=()=>{},onImmediateChange=()=>{}){this.root=root;this.manager=manager;this.onMessage=onMessage;this.onOpenReport=onOpenReport;this.onContractSelection=onContractSelection;this.onImmediateChange=onImmediateChange;this.lastHtml='';this.powerAmount='50';this.selectedContractId=null;this.contractsExpanded=false;}
  update(){
    const dc=this.manager,metrics=dc.simulation.metrics,active=dc.activeContracts,installing=dc.state.contracts.filter(contract=>contract.status==='installing');
    const powerCapacity=dc.contractedPowerKW,powerCurrent=dc.facilityPowerKW,powerCommitted=dc.committedPowerKW;
    const coolingCapacity=dc.effectiveCoolingCapacityKW,coolingCurrent=dc.currentRackHeatKW,coolingCommitted=dc.committedCoolingKW;
    const coolingNominal=(metrics.coolingInstalledCapacity||0)/1000,coolingDelivered=(metrics.coolingDelivered||0)/1000;
    const coolingUnits=dc.world.entitiesByType('coolingUnit');
    const coolingReasons=coolingUnits.map(unit=>{
      if(!unit.enabled)return (unit.name||'Condensadora')+': desligada';
      if(unit.powerBlocked)return (unit.name||'Condensadora')+': sem energia';
      if(unit.status==='DISCONNECTED'||unit.status==='OFF')return (unit.name||'Condensadora')+': sem rede de dutos conectada';
      if(unit.networkStatus&&unit.networkStatus!=='READY')return (unit.name||'Condensadora')+': rede de refrigeração '+unit.networkStatus;
      if(unit.availableCapacity+1<unit.ratedCoolingCapacity)return (unit.name||'Condensadora')+': capacidade reduzida pela temperatura de '+Number(unit.outdoorTemperature||25).toFixed(1)+' °C';
      if(unit.currentAirFlow<unit.maxAirFlow*.9)return (unit.name||'Condensadora')+': vazão limitada a '+Number(unit.currentAirFlow||0).toFixed(1)+' / '+unit.maxAirFlow+' m³/s';
      return null;
    }).filter(Boolean);
    const coolingDetails='<div class="dc-available"><span>Capacidade nominal instalada</span><strong>'+kw(coolingNominal)+'</strong></div><div class="dc-available"><span>Capacidade disponível agora</span><strong>'+kw(coolingCapacity)+'</strong></div><div class="dc-available"><span>Calor removido da sala agora</span><strong>'+kw(coolingDelivered)+'</strong></div><small class="dc-cooling-note">A capacidade disponível é o limite das condensadoras; dutos e saídas determinam quanto frio chega aos racks.</small>'+(coolingReasons.length?'<p class="dc-risk">'+coolingReasons.map(escapeHtml).join(' · ')+'</p>':'');
    const committedPowerUse=powerCapacity?100*powerCommitted/powerCapacity:powerCommitted?100:0;
    const coolingUse=coolingCapacity?100*coolingCommitted/coolingCapacity:coolingCommitted?100:0;
    const remainingPower=dc.powerGrid.remainingCapacityKW,requestedAmount=Number(this.powerAmount),defaultAddedKW=remainingPower?Math.min(Number.isInteger(requestedAmount)&&requestedAmount>0?requestedAmount:50,remainingPower):0;
    const powerQuote=defaultAddedKW?dc.powerGrid.quote(defaultAddedKW):null;
    const powerPreview=powerQuote?.ok?'Instalação '+money(powerQuote.cost)+' · +'+money(powerQuote.monthlyIncrease)+'/mês · total '+kw(powerQuote.capacityKW)+' · tarifa fixa '+money(powerQuote.monthlyFixedCost)+'/mês':'Capacidade máxima contratada';
    const offers=[...dc.state.offers].sort((a,b)=>b.offeredDay-a.offeredDay||a.expiresDay-b.expiresDay);
    const offerCard=offer=>{
      const requestedPower=offer.rackCount*offer.powerPerRackKW;
      const exceedsCapacity=requestedPower>dc.availableEnergyKW||requestedPower>dc.availableCoolingContractsKW;
      const state=offerDisplayState(offer,dc.clock.day);
      const locked=offer.locked&&(dc.state.reputation||0)<offer.requiredReputation;
      const badge=locked?'BLOQUEADA · reputação '+offer.requiredReputation:offer.renewalContractId?'RENOVAÇÃO':state;
      return '<article class="dc-offer '+(state==='NOVO'?'is-new ':'')+(locked?'is-locked':'')+'"><div class="dc-offer-head"><div><small>'+escapeHtml(offer.tier.toUpperCase())+' · '+badge+'</small><h4>'+escapeHtml(offer.clientName)+'</h4></div><b>'+dailyMoney(offer.monthlyFee)+'<small>/dia</small></b></div><div class="dc-offer-grid"><span>Categoria<strong>'+escapeHtml(offer.clientTier||'business')+'</strong></span><span>Racks<strong>'+offer.rackCount+'</strong></span><span>Potência<strong>'+kw(requestedPower)+'</strong></span><span>Por rack<strong>'+kw(offer.powerPerRackKW)+'</strong></span><span>SLA térmico<strong>'+offer.maxInletTemperature+' °C</strong></span><span>Disponibilidade<strong>'+offer.availability+'%</strong></span><span>Prazo<strong>'+offer.termDays+' dias</strong></span><span>Preço reputação<strong>'+(Number(offer.reputationMultiplier)||1).toFixed(2)+'×</strong></span></div><div class="dc-offer-footer"><span>'+(locked?'Exige reputação '+offer.requiredReputation:offerExpiryLabel(offer,dc.clock.day))+'</span><div><button data-decline="'+offer.id+'">Recusar</button><button class="primary" data-accept="'+offer.id+'" '+(locked?'disabled':'')+'>Aceitar</button></div></div><p class="dc-risk '+(exceedsCapacity?'power-risk':'')+'">Máximo solicitado '+kw(requestedPower)+' · reserva elétrica '+kw(dc.powerReserveKW)+' · reserva térmica para racks '+kw(dc.availableCoolingContractsKW)+'.</p></article>';
    };
    const newOffers=offers.filter(offer=>offer.offeredDay===dc.clock.day),olderOffers=offers.filter(offer=>offer.offeredDay!==dc.clock.day);
    const market='<section id="dc-market" class="dc-subsection"><div class="dc-section-title"><b>MERCADO</b><span>'+offers.length+' contratos disponíveis</span></div>'+(offers.length?'<div class="dc-market-group"><small>NOVOS</small>'+(newOffers.map(offerCard).join('')||'<p class="dc-empty">Nenhum contrato novo hoje.</p>')+'</div><div class="dc-market-group"><small>ANTERIORES</small>'+(olderOffers.map(offerCard).join('')||'<p class="dc-empty">As propostas anteriores aparecem aqui até serem aceitas, recusadas ou expirarem.</p>')+'</div>':'<p class="dc-empty">Nenhum contrato disponível.</p>')+'</section>';
    const liveContracts=dc.state.contracts.filter(contract=>['active','installing'].includes(contract.status));
    const installedContractRacks=dc.world.entitiesByType('serverRack').filter(rack=>liveContracts.some(contract=>contract.id===rack.contractId)).length;
    if(this.selectedContractId&&!liveContracts.some(contract=>contract.id===this.selectedContractId)){this.selectedContractId=null;this.onContractSelection(null,[],false);}
    const contracts=liveContracts.map(contract=>{
      const availability=contract.activeSeconds?100*contract.uptimeSeconds/contract.activeSeconds:100;
      const violated=contract.dailyViolation||contract.lastSlaViolationDay===dc.clock.day;
      const selected=this.selectedContractId===contract.id,racks=dc.world.entitiesByType('serverRack').filter(rack=>rack.contractId===contract.id);
      const rackList=racks.length?'<ul class="dc-contract-racks">'+racks.map(rack=>'<li><span>'+escapeHtml(rack.name||'Rack')+'</span><small>posição '+(rack.x+1)+', '+(rack.y+1)+'</small></li>').join('')+'</ul>':'<p class="dc-empty">Nenhum rack deste contrato foi colocado ainda.</p>';
      const missing=Math.max(0,contract.rackCount-racks.length);
      const details=selected?'<div class="dc-contract-details"><b>RACKS DO CONTRATO · '+racks.length+' / '+contract.rackCount+'</b>'+rackList+(missing?'<p class="dc-empty">Faltam '+missing+' rack'+(missing===1?'':'s')+' para instalar.</p>':'')+'</div>':'';
      return '<article class="dc-contract '+(selected?'is-selected':'')+'" data-select-contract="'+escapeHtml(contract.id)+'" aria-expanded="'+selected+'"><div><b>'+escapeHtml(contract.clientName)+'</b><span class="dc-state '+(violated?'violated':contract.status)+'">'+(violated?'SLA VIOLADO':statusLabel(contract.status))+'</span></div><p>'+contract.installedRacks+' / '+contract.rackCount+' racks · '+kw(contract.rackCount*contract.powerPerRackKW)+' · '+dailyMoney(contract.monthlyFee)+'/dia</p><p>SLA '+contract.maxInletTemperature+' °C · disponibilidade '+contract.availability+'% · atual '+availability.toFixed(2)+'%</p>'+details+'<button data-cancel="'+escapeHtml(contract.id)+'">Cancelar contrato</button></article>';
    }).join('');
    const activeContractCount=liveContracts.filter(contract=>contract.status==='active').length;
    const committedRacks=liveContracts.reduce((sum,contract)=>sum+contract.rackCount,0);
    const contractSummary='<div class="dc-contract-summary"><span>Ativos<strong>'+activeContractCount+'</strong></span><span>Instalação<strong>'+installing.length+'</strong></span><span>Racks instalados<strong>'+installedContractRacks+' / '+committedRacks+'</strong></span><span>Potência comprometida<strong>'+kw(dc.committedPowerKW)+'</strong></span><span>Consumo atual<strong>'+kw(dc.currentContractRackPowerKW)+'</strong></span></div>';
    const contractList=contracts||'<p class="dc-empty">Aceite uma proposta para começar a operar.</p>';
    const contractAccordion='<section class="dc-subsection dc-active-clients"><div class="dc-section-title"><b>CLIENTES ATIVOS</b><span>'+liveContracts.length+' '+(liveContracts.length===1?'contrato':'contratos')+' · '+installing.length+' instalações pendentes</span></div>'+contractSummary+'<button class="dc-accordion-toggle" type="button" data-contract-accordion-toggle aria-expanded="'+this.contractsExpanded+'" aria-controls="dc-contract-accordion">'+(this.contractsExpanded?'Ocultar contratos':'Mostrar contratos')+'</button><div id="dc-contract-accordion" data-contract-accordion-panel '+(this.contractsExpanded?'':'hidden')+'>'+contractList+'</div></section>';
    const ledger=dc.state.ledger.slice(0,5).map(item=>'<div class="dc-ledger-row"><span>D'+item.day+' · '+item.description+'</span><b class="'+(item.amount<0?'negative':'positive')+'">'+(item.amount<0?'−':'+')+money(Math.abs(item.amount))+'</b></div>').join('')||'<p class="dc-empty">Os lançamentos diários aparecerão aqui.</p>';
    const daily=dc.state.dailyResult;
    const reputation=dc.reputation,tier=reputation.tier,tierIndex=REPUTATION_TIERS.findIndex(item=>item.id===tier.id),nextTier=REPUTATION_TIERS[tierIndex+1];
    const progress=nextTier?100*(reputation.value-tier.minimum)/(nextTier.minimum-tier.minimum):100;
    const reputationHistory=dc.state.reputationHistory.slice(-5).reverse().map(item=>'<li><span>Dia '+item.day+' · '+escapeHtml(item.reason)+'</span><b class="'+(item.change<0?'negative':'positive')+'">'+(item.change>0?'+':'')+item.change.toFixed(2)+'</b></li>').join('')||'<li>Seu histórico começará a aparecer após as primeiras operações.</li>';
    const tierClients={startup:'startups',small:'pequenos clientes',business:'empresas',corporate:'corporativos',enterprise:'grandes empresas',premium:'premium',hyperscale:'hiperescala'};
    const reputationLevels=REPUTATION_TIERS.map(item=>'<li><b>'+item.name+' · '+item.minimum+'–'+item.maximum+'</b><span>'+item.offerRange[0]+'–'+item.offerRange[1]+' ofertas/dia · '+item.clients.map(client=>tierClients[client]||client).join(', ')+'</span></li>').join('');
    const reputationPanel='<section class="dc-reputation"><div><span>REPUTAÇÃO</span><b>'+tier.name+' · '+reputation.value.toFixed(0)+'/100</b></div><progress max="100" value="'+pct(progress)+'"></progress><small>'+(nextTier?'Próximo nível: '+nextTier.name+' em '+nextTier.minimum+' pontos':'Nível máximo alcançado')+' · preço contratual '+reputationPriceMultiplier(reputation.value).toFixed(2)+'×</small><details><summary>Níveis e benefícios</summary><ul>'+reputationLevels+'</ul></details><details><summary>Histórico recente</summary><ul>'+reputationHistory+'</ul></details></section>';
    const capacitySection='<div class="dc-capacity"><div class="dc-section-title"><b>CAPACIDADE</b><span>carga atual, compromisso e infraestrutura</span></div>'+this.capacityMatrix(powerCurrent,dc.committedFacilityPowerKW,dc.committedPowerKW,dc.otherFacilityPowerKW,powerCapacity,coolingCurrent,coolingCommitted,coolingCapacity)+this.capacityRow('Energia comprometida',powerCommitted,powerCapacity,committedPowerUse,'kW')+this.capacityRow('Calor comprometido',coolingCommitted,coolingCapacity,coolingUse,'kW')+coolingDetails+'<div class="dc-available '+(dc.powerReserveKW<0?'power-risk':'')+'"><span>Reserva elétrica para novos contratos</span><strong>'+kw(dc.powerReserveKW)+'</strong></div><div class="dc-available '+(dc.coolingReserveKW<0?'power-risk':'')+'"><span>Reserva térmica equivalente para racks</span><strong>'+kw(dc.coolingReserveKW/.98)+'</strong></div><div class="dc-available"><span>Recurso limitante</span><strong>'+dc.bottleneckResource+'</strong></div><div class="dc-available"><span>Capacidade para novos contratos</span><strong>'+kw(dc.capacityForNewContractsKW)+'</strong></div><div class="dc-power-upgrade"><label for="dc-power-amount">Adicionar potência (kW)<input id="dc-power-amount" data-power-amount type="number" min="1" max="'+remainingPower+'" step="1" value="'+defaultAddedKW+'" '+(remainingPower?'':'disabled')+'></label><span class="dc-power-preview" data-power-preview>'+powerPreview+'</span><button data-upgrade '+(!powerQuote?.ok||powerQuote.cost>dc.cash?'disabled':'')+'>Contratar potência</button><small>Instalação '+unitRate(POWER_INSTALL_COST_PER_KW)+'/kW · acréscimo '+unitRate(POWER_MONTHLY_COST_PER_KW)+'/kW/mês</small></div></div>';
    const html='<section class="dc-dashboard"><div class="dc-dashboard-head"><div><span>OPERAÇÃO</span><strong>'+dc.clock.format()+'</strong></div><b>'+money(dc.cash)+'</b></div>'+
      '<div class="dc-kpis"><div><small>CLIENTES</small><b>'+dc.clientCount+'</b></div><div><small>RACKS INSTALADOS</small><b>'+dc.rackCount+'</b></div><div><small>CONTRATOS</small><b>'+active.length+' ativos</b></div><div><small>PUE</small><b>'+(dc.pue==null?'—':dc.pue.toFixed(2))+'</b></div></div>'+
      '<label class="dc-pause-setting"><input type="checkbox" data-pause-new '+(dc.state.pauseOnNewContracts?'checked':'')+'> Pausar quando novos contratos chegarem</label>'+
      (daily?'<button class="dc-report-open" data-open-report>Último relatório · Dia '+daily.day+'</button>':'')+
      capacitySection+this.powerProtection()+'<div class="dc-thermal"><span>Ar máximo</span><b>'+(metrics.maxAirTemp||0).toFixed(1)+' °C</b><span>Tarifa</span><b>'+tariff(dc.state.energyTariff)+'/kWh</b></div>'+reputationPanel+market+
      contractAccordion+
      '<section class="dc-subsection"><div class="dc-section-title"><b>FINANÇAS · ÚLTIMO DIA</b><span>'+(daily?'lucro '+money(daily.net):'dia ainda não fechado')+'</span></div>'+ledger+'</section>'+ 
      '<div class="dc-save-actions"><button data-save>Salvar agora</button><button data-load>Carregar último salvamento</button></div></section>';
    const activeElement=typeof document!=='undefined'?document.activeElement:null;
    const hasFocusedControl=activeElement&&typeof this.root.contains==='function'&&this.root.contains(activeElement)&&activeElement.matches('button,input,select');
    if(html!==this.lastHtml&&!hasFocusedControl){
      const openReputationDetails=[...(this.root.querySelectorAll?.('.dc-reputation details')||[])].map(details=>details.open);
      const focusedMarketId=activeElement?.dataset?.accept||activeElement?.dataset?.decline||null;
      this.root.innerHTML=html;this.lastHtml=html;this.bind();
      this.root.querySelectorAll?.('.dc-reputation details').forEach((details,index)=>{details.open=Boolean(openReputationDetails[index]);});
      if(focusedMarketId)this.root.querySelector(`[data-accept="${focusedMarketId}"],[data-decline="${focusedMarketId}"]`)?.focus();
      if(offers.some(offer=>offer.isNew))dc.markOffersSeen(offers.filter(offer=>offer.isNew).map(offer=>offer.id));
    }
  }
  powerProtection(){
    const grid=this.manager.powerGrid;
    return '<div class="dc-available"><span>Rede elétrica</span><strong>'+grid.status+'</strong></div><div class="dc-available"><span>Demanda solicitada</span><strong>'+kw(grid.demandKW)+'</strong></div><div class="dc-available"><span>Racks sem energia</span><strong>'+grid.blockedRacks+'</strong></div>'+(grid.overloadSeconds>0?'<p class="dc-risk">Corte em '+grid.remainingSeconds.toFixed(1)+' s de simulação física.</p>':'')+(grid.breakerOpen||grid.blockedRacks?'<button data-rearm>Rearmar energia</button>':'');
  }
  capacityRow(label,used,capacity,percentage,unit){const usage=unit==='kW'?kw(used)+' / '+kw(capacity):used+' / '+capacity+' racks';return '<div class="dc-cap-row"><div><span>'+label+'</span><b>'+usage+'</b></div><div class="dc-bar"><i class="'+(percentage>=(label.startsWith('Energia')?90:80)?'warn':'')+'" style="width:'+pct(percentage)+'%"></i></div></div>';}
  capacityMatrix(powerCurrent,powerCommitted,rackPeakPower,otherPower,powerCapacity,coolingCurrent,coolingCommitted,coolingCapacity){
    const row=(label,power,powerDetail,cooling,coolingDetail)=>'<div class="dc-cap-matrix-row" role="row"><span role="rowheader">'+label+'</span><b role="cell">'+kw(power)+(powerDetail?'<small>'+powerDetail+'</small>':'')+'</b><b role="cell">'+kw(cooling)+(coolingDetail?'<small>'+coolingDetail+'</small>':'')+'</b></div>';
    return '<div class="dc-cap-matrix" role="table" aria-label="Consumo e capacidade contratual elétrica e térmica"><div class="dc-cap-matrix-row head" role="row"><span role="columnheader">CARGA</span><b role="columnheader">ENERGIA</b><b role="columnheader">REFRIGERAÇÃO</b></div>'+row('Atual',powerCurrent,'instalação inteira',coolingCurrent,'calor atual dos racks')+row('Comprometida',powerCommitted,kw(rackPeakPower)+' racks + '+kw(otherPower)+' outras cargas',coolingCommitted,'pico contratado dos racks')+row('Capacidade',powerCapacity,'rede contratada',coolingCapacity,'efetiva agora')+'</div>';
  }
  bind(){
    const accordionToggle=this.root.querySelector('[data-contract-accordion-toggle]'),accordionPanel=this.root.querySelector('[data-contract-accordion-panel]');
    accordionToggle?.setAttribute('aria-expanded',String(this.contractsExpanded));
    if(accordionPanel)accordionPanel.hidden=!this.contractsExpanded;
    accordionToggle?.addEventListener('click',event=>{
      this.contractsExpanded=!this.contractsExpanded;
      const button=event.currentTarget,panel=this.root.querySelector('[data-contract-accordion-panel]');
      button.setAttribute('aria-expanded',String(this.contractsExpanded));
      button.textContent=this.contractsExpanded?'Ocultar contratos':'Mostrar contratos';
      if(panel)panel.hidden=!this.contractsExpanded;
    });
    this.root.querySelector('[data-rearm]')?.addEventListener('click',()=>{const result=this.manager.rearmPower();this.onMessage(result.ok?result.restored+' racks religados; '+result.remaining+' continuam sem energia.':result.reason);this.onImmediateChange();this.update();});
    this.root.querySelectorAll('[data-accept]').forEach(button=>button.onclick=()=>{const result=this.manager.acceptOffer(button.dataset.accept);this.onMessage(result.ok?(result.alreadyAccepted?'Este contrato já foi aceito. Instale os racks solicitados.':'Contrato assinado. Instale os racks solicitados.'):result.reason);if(result.ok)this.onImmediateChange();this.lastHtml='';this.update();});
    this.root.querySelectorAll('[data-decline]').forEach(button=>button.onclick=()=>{this.manager.declineOffer(button.dataset.decline);this.onImmediateChange();this.lastHtml='';this.update();});
    this.root.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{if(this.manager.cancelContract(button.dataset.cancel)){this.onMessage('Contrato encerrado; os racks foram desligados.');this.onImmediateChange();this.update();}});
    this.root.querySelectorAll('[data-select-contract]').forEach(card=>card.addEventListener('click',event=>{
      if(event.target.closest?.('[data-cancel]'))return;
      const contractId=card.dataset.selectContract;
      if(this.selectedContractId===contractId){this.selectedContractId=null;this.onContractSelection(null,[],false);}
      else{
        this.selectedContractId=contractId;
        const racks=this.manager.world.entitiesByType('serverRack').filter(rack=>rack.contractId===contractId);
        this.onContractSelection(contractId,racks,true);
      }
      this.lastHtml='';this.update();
    }));
    const amountInput=this.root.querySelector('[data-power-amount]'),preview=this.root.querySelector('[data-power-preview]'),upgradeButton=this.root.querySelector('[data-upgrade]');
    const refreshPowerPreview=()=>{
      if(!amountInput)return;
      const quote=this.manager.powerGrid.quote(amountInput.value);
      if(preview)preview.textContent=quote.ok?'Instalação '+money(quote.cost)+' · +'+money(quote.monthlyIncrease)+'/mês · total '+kw(quote.capacityKW)+' · tarifa fixa '+money(quote.monthlyFixedCost)+'/mês':quote.reason;
      if(upgradeButton)upgradeButton.disabled=!quote.ok||quote.cost>this.manager.cash;
    };
    amountInput?.addEventListener('input',()=>{this.powerAmount=amountInput.value;refreshPowerPreview();});
    upgradeButton?.addEventListener('click',()=>{const result=this.manager.upgradePower(amountInput?.value);this.onMessage(result.ok?'Rede ampliada em '+result.addedKW+' kW; capacidade '+result.capacityKW+' kW, tarifa fixa '+money(result.monthlyFixedCost)+'/mês.':result.reason);if(result.ok){this.powerAmount=String(Math.min(50,this.manager.powerGrid.remainingCapacityKW));this.onImmediateChange();}this.lastHtml='';this.update();});
    this.root.querySelector('[data-pause-new]')?.addEventListener('change',event=>{this.manager.setPauseOnNewContracts(event.target.checked);this.onImmediateChange();});
    this.root.querySelector('[data-open-report]')?.addEventListener('click',()=>this.onOpenReport());
    this.root.querySelector('[data-save]')?.addEventListener('click',()=>this.onMessage(this.manager.persist()?'Data center salvo.':'Não foi possível salvar neste navegador.'));
    this.root.querySelector('[data-load]')?.addEventListener('click',()=>{const loaded=this.manager.load();this.onMessage(loaded?'Salvamento carregado.':'Nenhum salvamento encontrado.');this.lastHtml='';if(loaded){this.onImmediateChange();this.update();}});
  }
}
