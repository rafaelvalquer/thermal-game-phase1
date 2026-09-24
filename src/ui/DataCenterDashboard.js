import { POWER_TIERS } from '../datacenter/PowerGridSystem.js';

const money=value=>'R$ '+Math.round(Number(value)||0).toLocaleString('pt-BR');
const kw=value=>(Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kW';
const tariff=value=>'R$ '+(Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=value=>Math.max(0,Math.min(100,Number(value)||0));
const statusLabel=status=>({installing:'INSTALAÇÃO',active:'EM OPERAÇÃO',completed:'CONCLUÍDO',cancelled:'ENCERRADO'})[status]||status.toUpperCase();

export class DataCenterDashboard {
  constructor(root,manager,onMessage=()=>{}){this.root=root;this.manager=manager;this.onMessage=onMessage;this.lastHtml='';}
  update(){
    const dc=this.manager,metrics=dc.simulation.metrics,active=dc.activeContracts,installing=dc.state.contracts.filter(contract=>contract.status==='installing');
    const powerUse=dc.powerGrid.capacityKW?100*dc.facilityPowerKW/dc.powerGrid.capacityKW:0;
    const coolingCapacity=dc.installedCoolingKW;
    const coolingLoad=dc.rackCoolingDemandKW;
    const coolingUse=coolingCapacity?100*coolingLoad/coolingCapacity:coolingLoad?100:0;
    const spaceUse=100*dc.rackCount/Math.max(1,dc.level.datacenter.rackSpace);
    const next=dc.nextPowerTier;
    const upgrades=POWER_TIERS.filter(tier=>tier.capacityKW>dc.powerGrid.capacityKW).map(tier=>'<option value="'+tier.capacityKW+'">'+tier.capacityKW.toLocaleString('pt-BR')+' kW · '+money(tier.installationCost)+' · '+money(tier.monthlyFixedCost)+'/mês</option>').join('');
    const offers=dc.state.offers.map(offer=>'<article class="dc-offer"><div class="dc-offer-head"><div><small>'+offer.tier.toUpperCase()+'</small><h4>'+offer.clientName+'</h4></div><b>'+money(offer.monthlyFee)+'<small>/mês</small></b></div><div class="dc-offer-grid"><span>Racks<strong>'+offer.rackCount+'</strong></span><span>Potência<strong>'+kw(offer.rackCount*offer.powerPerRackKW)+'</strong></span><span>Por rack<strong>'+kw(offer.powerPerRackKW)+'</strong></span><span>SLA térmico<strong>'+offer.maxInletTemperature+' °C</strong></span><span>Disponibilidade<strong>'+offer.availability+'%</strong></span><span>Prazo<strong>'+offer.termDays+' dias</strong></span></div><div class="dc-offer-footer"><span>Instalação '+money(offer.installationFee)+'</span><div><button data-decline="'+(offer.contractId||offer.id)+'">Recusar</button><button class="primary" data-accept="'+(offer.contractId||offer.id)+'">Aceitar</button></div></div><p class="dc-risk">Energia necessária '+kw(offer.rackCount*offer.powerPerRackKW)+' · disponível '+kw(dc.availableEnergyKW)+' energia / '+kw(dc.availableCoolingKW)+' refrigeração. A aceitação continua disponível mesmo sem capacidade suficiente.</p></article>').join('');
    const contracts=dc.state.contracts.filter(contract=>['active','installing'].includes(contract.status)).map(contract=>{
      const availability=contract.activeSeconds?100*contract.uptimeSeconds/contract.activeSeconds:100;
      const violated=contract.dailyViolation||contract.lastSlaViolationDay===dc.clock.day;
      return '<article class="dc-contract"><div><b>'+contract.clientName+'</b><span class="dc-state '+(violated?'violated':contract.status)+'">'+(violated?'SLA VIOLADO':statusLabel(contract.status))+'</span></div><p>'+contract.installedRacks+' / '+contract.rackCount+' racks · '+kw(contract.rackCount*contract.powerPerRackKW)+' · '+money(contract.monthlyFee)+'/mês</p><p>SLA '+contract.maxInletTemperature+' °C · disponibilidade '+contract.availability+'% · atual '+availability.toFixed(2)+'%</p><button data-cancel="'+contract.id+'">Cancelar contrato</button></article>';
    }).join('');
    const ledger=dc.state.ledger.slice(0,5).map(item=>'<div class="dc-ledger-row"><span>D'+item.day+' · '+item.description+'</span><b class="'+(item.amount<0?'negative':'positive')+'">'+(item.amount<0?'−':'+')+money(Math.abs(item.amount))+'</b></div>').join('')||'<p class="dc-empty">Os lançamentos diários aparecerão aqui.</p>';
    const daily=dc.state.dailyResult;
    const html='<section class="dc-dashboard"><div class="dc-dashboard-head"><div><span>OPERAÇÃO</span><strong>'+dc.clock.format()+'</strong></div><b>'+money(dc.cash)+'</b></div>'+
      '<div class="dc-kpis"><div><small>CLIENTES</small><b>'+dc.clientCount+'</b></div><div><small>RACKS</small><b>'+dc.rackCount+' / '+dc.level.datacenter.rackSpace+'</b></div><div><small>CONTRATOS</small><b>'+active.length+' ativos</b></div><div><small>PUE</small><b>'+(dc.pue==null?'—':dc.pue.toFixed(2))+'</b></div></div>'+
      '<div class="dc-capacity"><div class="dc-section-title"><b>CAPACIDADE</b><span>disponível para novos contratos</span></div>'+this.capacityRow('Energia',dc.facilityPowerKW,dc.powerGrid.capacityKW,powerUse,'kW')+this.capacityRow('Refrigeração',coolingLoad,coolingCapacity,coolingUse,'kW')+this.capacityRow('Espaço',dc.rackCount,dc.level.datacenter.rackSpace,spaceUse,'racks')+'<div class="dc-available"><span>Recurso limitante</span><strong>'+dc.bottleneckResource+'</strong></div><div class="dc-available"><span>Capacidade energética e térmica</span><strong>'+kw(dc.capacityForNewContractsKW)+'</strong></div><div class="dc-available"><span>Vagas para racks</span><strong>'+dc.rackSpaceAvailable+'</strong></div><div class="dc-power-upgrade"><select data-power-tier '+(upgrades?'':'disabled')+'><option value="">'+(next?'Contratar mais potência…':'Capacidade máxima contratada')+'</option>'+upgrades+'</select><button data-upgrade '+(upgrades?'':'disabled')+'>Ampliar rede</button></div></div>'+ 
      '<div class="dc-thermal"><span>Refrigeração</span><b>'+kw(coolingCapacity)+'</b><span>Ar máximo</span><b>'+(metrics.maxAirTemp||0).toFixed(1)+' °C</b><span>Tarifa</span><b>'+tariff(dc.state.energyTariff)+'/kWh</b><span>Reputação</span><b>'+dc.state.reputation.toFixed(0)+' / 100</b></div>'+
      '<section class="dc-subsection"><div class="dc-section-title"><b>MERCADO</b><span>aceitar além da capacidade traz risco</span></div>'+(offers||'<p class="dc-empty">Novas propostas chegam periodicamente.</p>')+'</section>'+ 
      '<section class="dc-subsection"><div class="dc-section-title"><b>CLIENTES ATIVOS</b><span>'+installing.length+' instalações pendentes</span></div>'+(contracts||'<p class="dc-empty">Aceite uma proposta para começar a operar.</p>')+'</section>'+ 
      '<section class="dc-subsection"><div class="dc-section-title"><b>FINANÇAS · ÚLTIMO DIA</b><span>'+(daily?'lucro '+money(daily.net):'dia ainda não fechado')+'</span></div>'+ledger+'</section>'+ 
      '<div class="dc-save-actions"><button data-save>Salvar agora</button><button data-load>Carregar último salvamento</button></div></section>';
    if(html!==this.lastHtml){
      const select=this.root.querySelector('[data-power-tier]');
      const preserveOpen=select&&document.activeElement===select;
      const selectedValue=select?.value||'';
      this.root.innerHTML=html;this.lastHtml=html;this.bind();
      const nextSelect=this.root.querySelector('[data-power-tier]');
      if(nextSelect&&selectedValue)nextSelect.value=selectedValue;
      if(preserveOpen)nextSelect?.focus();
    }
  }
  capacityRow(label,used,capacity,percentage,unit){
    const usage=unit==='kW'?kw(used)+' / '+kw(capacity):used+' / '+capacity+' racks';
    return '<div class="dc-cap-row"><div><span>'+label+'</span><b>'+usage+'</b></div><div class="dc-bar"><i class="'+(percentage>=100?'overload':percentage>=80?'warn':'')+'" style="width:'+pct(percentage)+'%"></i></div></div>';
  }
  bind(){
    this.root.querySelectorAll('[data-accept]').forEach(button=>button.onclick=()=>{button.disabled=true;const result=this.manager.acceptOffer(button.dataset.accept);this.onMessage(result.ok?(result.alreadyAccepted?'Este contrato já foi aceito. Instale os racks solicitados.':'Contrato assinado. Instale os racks solicitados.'):result.reason);if(!result.ok)this.lastHtml='';this.update();});
    this.root.querySelectorAll('[data-decline]').forEach(button=>button.onclick=()=>{this.manager.declineOffer(button.dataset.decline);this.update();});
    this.root.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{if(this.manager.cancelContract(button.dataset.cancel)){this.onMessage('Contrato encerrado; os racks foram desligados.');this.update();}});
    this.root.querySelector('[data-upgrade]')?.addEventListener('click',()=>{
      const target=this.root.querySelector('[data-power-tier]')?.value;if(!target)return;
      const result=this.manager.upgradePower(target);this.onMessage(result.ok?'Rede ampliada para '+result.tier.capacityKW+' kW.':result.reason);this.update();
    });
    this.root.querySelector('[data-save]')?.addEventListener('click',()=>this.onMessage(this.manager.persist()?'Data center salvo.':'Não foi possível salvar neste navegador.'));
    this.root.querySelector('[data-load]')?.addEventListener('click',()=>{const loaded=this.manager.load();this.onMessage(loaded?'Salvamento carregado.':'Nenhum salvamento encontrado.');if(loaded)this.update();});
  }
}
