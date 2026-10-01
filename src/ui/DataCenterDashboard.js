import {POWER_INSTALL_COST_PER_KW,POWER_MAX_CAPACITY_KW,POWER_MONTHLY_COST_PER_KW} from '../datacenter/PowerGridSystem.js';

const money=value=>'R$ '+Math.round(Number(value)||0).toLocaleString('pt-BR');
const kw=value=>(Number(value)||0).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kW';
const pct=value=>Math.max(0,Math.min(100,Number(value)||0));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export class DataCenterDashboard{
  constructor(root,manager,onMessage=()=>{},onOpenReport=()=>{},onOpenContracts=()=>{},onImmediateChange=()=>{}){
    this.root=root;this.manager=manager;this.onMessage=onMessage;this.onOpenReport=onOpenReport;this.onOpenContracts=onOpenContracts;this.onImmediateChange=onImmediateChange;this.lastHtml='';this.powerAmount='50';
  }
  update(){
    if(!this.root)return;const dc=this.manager,metrics=dc.simulation.metrics,capacity=dc.powerGrid.capacityKW,current=(metrics.powerDraw||0)/1000,remaining=dc.powerGrid.remainingCapacityKW;
    const requested=Number(this.powerAmount),added=remaining?Math.min(Number.isInteger(requested)&&requested>0?requested:50,remaining):0,quote=added?dc.powerGrid.quote(added):null;
    const grid=dc.powerGrid,active=dc.state.contracts.filter(item=>item.status==='active').length,installing=dc.state.contracts.filter(item=>item.status==='installing').length;
    const offers=dc.state.offers.filter(item=>item.expiresDay>=dc.clock.day).length;
    const html=`<section class="dc-dashboard"><div class="dc-dashboard-head"><div><span>OPERAÇÃO</span><strong>${escapeHtml(dc.clock.format())}</strong></div><b>${money(dc.cash)}</b></div>
      <div class="dc-kpis"><div><small>CONTRATOS ATIVOS</small><b>${active}</b></div><div><small>INSTALAÇÕES</small><b>${installing}</b></div><div><small>RACKS</small><b>${dc.rackCount}</b></div><div><small>PUE</small><b>${dc.pue==null?'—':dc.pue.toFixed(2)}</b></div></div>
      <button class="dc-contract-summary-link" type="button" data-open-contract-center><span>Contratos · ${active} ativos · ${offers} propostas</span><b>Abrir Central →</b></button>
      ${dc.state.dailyResult?`<button class="dc-report-open" data-open-report>Último relatório · Dia ${dc.state.dailyResult.day}</button>`:''}
      <section class="dc-subsection"><div class="dc-section-title"><b>ENERGIA</b><span>${escapeHtml(grid.status)}</span></div>
        <div class="dc-available"><span>Limite da rede elétrica</span><strong>${kw(capacity)} / ${kw(POWER_MAX_CAPACITY_KW)}</strong></div><div class="dc-available"><span>Consumo atual da rede</span><strong>${kw(current)} / ${kw(capacity)}</strong></div>
        <div class="dc-available"><span>Reserva elétrica de contratos</span><strong>${kw(dc.powerReserveKW)}</strong></div><div class="dc-available"><span>Disponível para contratar na rede</span><strong>${kw(remaining)}</strong></div>
        <div class="dc-available"><span>Disjuntor</span><strong>${grid.breakerOpen?'ABERTO':'FECHADO'} · ${grid.blockedRacks} rack(s) sem energia</strong></div>
        ${grid.overloadSeconds>0?`<p class="dc-risk">Sobrecarga · corte seletivo em ${grid.remainingSeconds.toFixed(1)} s de simulação.</p>`:''}
        ${grid.breakerOpen||grid.blockedRacks?'<button data-rearm>Rearmar energia</button>':''}
        <div class="dc-power-upgrade"><label for="dc-power-amount">Contratar potência adicional (kW)<input id="dc-power-amount" data-power-amount type="number" min="1" max="${remaining}" step="1" value="${added}" ${remaining?'':'disabled'}></label><span class="dc-power-preview" data-power-preview>${quote?.ok?`Instalação ${money(quote.cost)} · +${money(quote.monthlyIncrease)}/mês · total ${kw(quote.capacityKW)} · tarifa fixa ${money(quote.monthlyFixedCost)}/mês`:'Limite máximo contratado'}</span><button data-upgrade ${!quote?.ok||quote.cost>dc.cash?'disabled':''}>Ampliar rede</button><small>Instalação ${money(POWER_INSTALL_COST_PER_KW)}/kW · tarifa ${money(POWER_MONTHLY_COST_PER_KW)}/kW/mês · máximo ${kw(POWER_MAX_CAPACITY_KW)}</small></div>
      </section>
      <section class="dc-subsection dc-thermal-reserve"><div class="dc-available"><span>Reserva térmica</span><strong>${kw(dc.coolingReserveKW)}</strong></div></section>
      <div class="dc-thermal"><span>Ar máximo</span><b>${(metrics.maxAirTemp||0).toFixed(1)} °C</b><span>Máquina máxima</span><b>${(metrics.maxMachineTemp||0).toFixed(1)} °C</b><span>Tarifa elétrica</span><b>R$ ${(Number(dc.state.energyTariff)||0).toFixed(2)}/kWh</b></div>
      <div class="dc-save-actions"><button data-save>Salvar agora</button><button data-load>Carregar último salvamento</button></div></section>`;
    const activeElement=typeof document!=='undefined'?document.activeElement:null,focused=activeElement&&this.root.contains?.(activeElement),focusSelector=activeElement?.matches?.('[data-power-amount]')?'[data-power-amount]':activeElement?.matches?.('[data-open-contract-center]')?'[data-open-contract-center]':null;
    if(html!==this.lastHtml&&!focused){this.root.innerHTML=html;this.lastHtml=html;this.bind();if(focusSelector)this.root.querySelector(focusSelector)?.focus();}
  }
  bind(){
    this.root.querySelector('[data-open-contract-center]')?.addEventListener('click',()=>this.onOpenContracts('market'));
    this.root.querySelector('[data-rearm]')?.addEventListener('click',()=>{const result=this.manager.rearmPower();this.onMessage(result.ok?`${result.restored} racks religados; ${result.remaining} continuam sem energia.`:result.reason);this.onImmediateChange();this.lastHtml='';this.update();});
    const input=this.root.querySelector('[data-power-amount]'),preview=this.root.querySelector('[data-power-preview]'),button=this.root.querySelector('[data-upgrade]');
    input?.addEventListener('input',()=>{this.powerAmount=input.value;const quote=this.manager.powerGrid.quote(input.value);if(preview)preview.textContent=quote.ok?`Instalação ${money(quote.cost)} · +${money(quote.monthlyIncrease)}/mês · total ${kw(quote.capacityKW)} · tarifa fixa ${money(quote.monthlyFixedCost)}/mês`:quote.reason;if(button)button.disabled=!quote.ok||quote.cost>this.manager.cash;});
    button?.addEventListener('click',()=>{const result=this.manager.upgradePower(input?.value);this.onMessage(result.ok?`Rede ampliada em ${result.addedKW} kW; total ${result.capacityKW} kW.`:result.reason);if(result.ok){this.powerAmount=String(Math.min(50,this.manager.powerGrid.remainingCapacityKW));this.onImmediateChange();}this.lastHtml='';this.update();});
    this.root.querySelector('[data-open-report]')?.addEventListener('click',()=>this.onOpenReport());
    this.root.querySelector('[data-save]')?.addEventListener('click',()=>this.onMessage(this.manager.persist()?'Data center salvo.':'Não foi possível salvar neste navegador.'));
    this.root.querySelector('[data-load]')?.addEventListener('click',()=>{const loaded=this.manager.load();this.onMessage(loaded?'Salvamento carregado.':'Nenhum salvamento encontrado.');this.lastHtml='';if(loaded){this.onImmediateChange();this.update();}});
  }
}
