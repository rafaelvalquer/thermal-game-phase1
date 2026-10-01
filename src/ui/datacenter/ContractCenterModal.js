import {ContractCenterDataService,escapeContractHtml as esc} from './ContractCenterDataService.js';
import {renderMarketTab} from './tabs/ContractMarketTab.js';
import {renderActiveContractsTab} from './tabs/ActiveContractsTab.js';
import {renderStatisticsTab} from './tabs/ContractStatisticsTab.js';
import {renderHistoryTab} from './tabs/ContractHistoryTab.js';

const TABS=[['market','Mercado'],['active','Em andamento'],['stats','Estatísticas'],['history','Histórico']];
const focusable='button:not([disabled]),input:not([disabled]),select:not([disabled]),[href],[tabindex]:not([tabindex="-1"])';

export class ContractCenterModal {
  constructor({root,trigger,manager,onRequestOpen=()=>{},onRequestClose=()=>{},onMessage=()=>{},onLocate=()=>{},onChange=()=>{}}){
    this.root=root;this.trigger=trigger;this.manager=manager;this.onRequestOpen=onRequestOpen;this.onRequestClose=onRequestClose;this.onMessage=onMessage;this.onLocate=onLocate;this.onChange=onChange;
    this.data=new ContractCenterDataService(manager);this.opened=false;this.activeTab='market';this.marketType='all';this.marketCapacity='all';this.marketSort='revenue';this.marketAnalysis=null;
    this.activeFilter='all';this.selectedContract=null;this.cancelConfirm=null;this.statsPeriod='all';this.historyState='all';this.historyType='all';this.historySearch='';this.lastSignature='';this.returnFocus=null;
    this.build();this.bind();this.updateBadge();
  }
  build(){
    if(!this.root)return;
    this.root.classList.add('contract-center-layer');this.root.hidden=true;this.root.setAttribute('aria-hidden','true');
    this.root.innerHTML='<section class="cc-dialog" role="dialog" aria-modal="true" aria-labelledby="cc-title" tabindex="-1"><header class="cc-header"><div><span class="cc-eyebrow">DATA CENTER · GESTÃO COMERCIAL</span><h1 id="cc-title" tabindex="-1">Central de Contratos</h1><p>Mercado, carteira, desempenho e histórico</p></div><button type="button" class="cc-close" data-cc-close aria-label="Fechar Central de Contratos">×</button></header><nav class="cc-tabs" role="tablist" aria-label="Seções comerciais">'+TABS.map(([key,label],index)=>'<button type="button" role="tab" id="cc-tab-'+key+'" aria-controls="cc-content" aria-selected="'+(index===0)+'" tabindex="'+(index===0?'0':'-1')+'" data-cc-tab="'+key+'">'+label+'</button>').join('')+'</nav><div class="cc-content" id="cc-content" role="tabpanel" tabindex="0" aria-labelledby="cc-tab-market"></div><footer class="cc-footer"><span data-cc-footer-day></span><span data-cc-footer-count></span></footer></section>';
  }
  bind(){
    this.trigger?.addEventListener('click',()=>this.onRequestOpen('market'));
    this.root?.addEventListener('click',event=>{
      if(event.target===this.root){if(!this.cancelConfirm)this.onRequestClose();return;}
      const close=event.target.closest('[data-cc-close]');if(close){this.onRequestClose();return;}
      const tab=event.target.closest('[data-cc-tab]');if(tab){this.setTab(tab.dataset.ccTab);return;}
      const analyze=event.target.closest('[data-market-analyze]');if(analyze){const id=analyze.dataset.marketAnalyze;this.marketAnalysis=this.marketAnalysis===id?null:id;this.render();return;}
      const accept=event.target.closest('[data-market-accept]');if(accept){this.acceptOffer(accept);return;}
      const decline=event.target.closest('[data-market-decline]');if(decline){this.declineOffer(decline);return;}
      const selected=event.target.closest('[data-contract-select]');if(selected){this.selectedContract=selected.dataset.contractSelect;this.cancelConfirm=null;this.render();return;}
      const locate=event.target.closest('[data-contract-locate]');if(locate){const contract=this.manager.state.contracts.find(item=>item.id===locate.dataset.contractLocate);if(contract)this.onLocate(contract,this.data.resolveEquipment(contract));return;}
      const cancel=event.target.closest('[data-contract-cancel]');if(cancel){this.cancelConfirm=cancel.dataset.contractCancel;this.render();this.root.querySelector('[data-cancel-confirm]')?.focus();return;}
      if(event.target.closest('[data-cancel-abort]')){this.cancelConfirm=null;this.render();this.root.querySelector('[data-contract-cancel]')?.focus();return;}
      const confirm=event.target.closest('[data-cancel-confirm]');if(confirm){const contract=this.manager.state.contracts.find(item=>item.id===confirm.dataset.cancelConfirm);if(contract&&this.manager.cancelContract(contract.id)){this.onMessage('Contrato de '+contract.clientName+' cancelado; reservas computacionais foram liberadas.');this.cancelConfirm=null;this.selectedContract=null;this.onChange('contract-ended',contract.id);this.render(true);}else{this.onMessage('Este contrato não pode mais ser cancelado.');this.cancelConfirm=null;this.render();}return;}
    });
    this.root?.addEventListener('change',event=>{
      const {target}=event;if(target.matches('[data-market-type]'))this.marketType=target.value;
      else if(target.matches('[data-market-capacity]'))this.marketCapacity=target.value;
      else if(target.matches('[data-market-sort]'))this.marketSort=target.value;
      else if(target.matches('[data-active-filter]')){this.activeFilter=target.value;this.selectedContract=null;}
      else if(target.matches('[data-stats-period]'))this.statsPeriod=target.value;
      else if(target.matches('[data-history-state]'))this.historyState=target.value;
      else if(target.matches('[data-history-type]'))this.historyType=target.value;
      else return;this.render(true);
    });
    this.root?.addEventListener('input',event=>{if(event.target.matches('[data-history-search]')){this.historySearch=event.target.value;this.render(true);}});
    this.root?.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(this.cancelConfirm){this.cancelConfirm=null;this.render();return;}this.onRequestClose();return;}
      if(event.key==='Tab'&&this.opened){const controls=[...this.root.querySelectorAll(focusable)].filter(item=>!item.hidden);if(!controls.length){event.preventDefault();return;}const first=controls[0],last=controls.at(-1);if(event.shiftKey&&this.root.ownerDocument.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&this.root.ownerDocument.activeElement===last){event.preventDefault();first.focus();}}
      if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&event.target.matches('[role="tab"]')){event.preventDefault();const index=TABS.findIndex(([key])=>key===this.activeTab),next=(index+(event.key==='ArrowRight'?1:TABS.length-1))%TABS.length;this.setTab(TABS[next][0],true);}
    });
  }
  show(tab='market',{focus=true}={}){
    if(!this.root)return false;
    this.opened=true;this.returnFocus=this.root.ownerDocument.activeElement;this.root.hidden=false;this.root.setAttribute('aria-hidden','false');this.setTab(tab,false);
    if(focus){const target=this.root.querySelector('[aria-selected="true"]');(target||this.root.querySelector('#cc-title'))?.focus();}return true;
  }
  hide({restoreFocus=true}={}){
    if(!this.opened)return false;this.opened=false;this.cancelConfirm=null;this.root.hidden=true;this.root.setAttribute('aria-hidden','true');this.lastSignature='';
    if(restoreFocus&&(this.trigger||this.returnFocus)?.focus)(this.trigger||this.returnFocus).focus();return true;
  }
  setTab(tab,focus=false){
    if(!TABS.some(([key])=>key===tab))tab='market';this.activeTab=tab;
    if(tab==='market')this.data.markMarketViewed();
    for(const [key] of TABS){const button=this.root.querySelector(`[data-cc-tab="${key}"]`);button?.setAttribute('aria-selected',String(key===tab));button?.setAttribute('tabindex',key===tab?'0':'-1');}
    const content=this.root.querySelector('.cc-content');content?.setAttribute('aria-labelledby','cc-tab-'+tab);
    this.lastSignature='';this.render(false);if(focus)this.root.querySelector(`[data-cc-tab="${tab}"]`)?.focus();this.updateBadge();return true;
  }
  acceptOffer(button){
    const id=button.dataset.marketAccept,offer=this.manager.state.offers.find(item=>item.id===id);if(!offer)return;
    button.disabled=true;const result=this.manager.acceptOffer(id);
    if(result.ok){this.onMessage(result.alreadyAccepted?'Este contrato já estava aceito.':result.contract.modality==='compute'?'Contrato Cloud provisionado e recursos reservados.':'Contrato assinado. Instale os racks contratados.');this.marketAnalysis=null;this.onChange();}
    else{this.onMessage(result.reason||'Não foi possível aceitar a proposta.');}
    this.render(true);this.updateBadge();
  }
  declineOffer(button){
    const offer=this.manager.state.offers.find(item=>item.id===button.dataset.marketDecline);if(!offer)return;
    if(this.manager.declineOffer(offer.id)){this.onMessage('Proposta de '+offer.clientName+' recusada.');this.onChange();}
    else this.onMessage('Esta proposta já não está disponível.');this.render(true);this.updateBadge();
  }
  render(preserveScroll=false){
    if(!this.root||!this.opened)return;
    const content=this.root.querySelector('.cc-content'),scroll=preserveScroll?content.scrollTop:0,active=this.root.ownerDocument.activeElement;
    const focusAttribute=active&&this.root.contains(active)?[...active.attributes].find(attribute=>attribute.name.startsWith('data-')):null;
    const focusValue=focusAttribute?.value;
    const focusAttr=active?.getAttribute?.('data-history-search')!==null&&active?.matches?.('[data-history-search]');
    const selection=focusAttr?{start:active.selectionStart,end:active.selectionEnd}:null;
    if(this.activeTab==='market')content.innerHTML=renderMarketTab(this.manager,this.data,this);
    else if(this.activeTab==='active')content.innerHTML=renderActiveContractsTab(this.manager,this.data,this);
    else if(this.activeTab==='stats')content.innerHTML=renderStatisticsTab(this.manager,this);
    else content.innerHTML=renderHistoryTab(this.manager,this);
    content.scrollTop=scroll;
    if(focusAttribute&&!focusAttr){const selector=`[${focusAttribute.name}="${globalThis.CSS?.escape?globalThis.CSS.escape(focusValue):focusValue.replace(/["\\]/g,'\\$&')}"]`;content.querySelector(selector)?.focus();}
    if(focusAttr){const input=content.querySelector('[data-history-search]');input?.focus();if(selection)input?.setSelectionRange(selection.start,selection.end);}
    const activeContracts=this.manager.state.contracts.filter(item=>item.status==='active').length;
    const day=this.manager.clock.day;
    const footerDay=this.root.querySelector('[data-cc-footer-day]'),footerCount=this.root.querySelector('[data-cc-footer-count]');
    if(footerDay)footerDay.textContent=`Dia ${day} · ${activeContracts} contratos ativos`;
    if(footerCount)footerCount.textContent=`${this.data.validOffers().length} propostas abertas`;
    this.updateBadge();
  }
  signature(){
    const state=this.manager.state;
    const offers=(state.offers||[]).map(item=>[item.id,item.monthlyFee,item.expiresDay,item.isNew].join(':')).join('|');
    const contracts=(state.contracts||[]).map(item=>[item.id,item.status,item.monthlyFee,item.expiresDay,item.dailyViolation,item.allocations?.length,item.totalRecurringRevenue].join(':')).join('|');
    const thermal=this.manager.world.entities.filter(item=>item.type==='serverRack'||item.type==='computeRack').map(item=>`${item.id}:${Math.round(Number(item.inletTemperature)||0)}:${item.status}`).join('|');
    return `${this.manager.clock.day}/${Math.floor(this.manager.cash)}/${offers}/${contracts}/${thermal}/${state.commercialDailyHistory?.length||0}/${this.manager.world.entities.length}`;
  }
  update(){
    this.updateBadge();if(!this.opened)return;
    const signature=this.signature();if(signature!==this.lastSignature){this.lastSignature=signature;this.render(true);this.lastSignature=signature;}
  }
  updateBadge(){
    if(!this.trigger)return;const count=this.data.newOfferCount(),badge=this.trigger.querySelector('[data-contract-badge]');
    if(badge){badge.textContent=count?String(count):'';badge.hidden=!count;}
    this.trigger.classList.toggle('is-active',this.opened);this.trigger.setAttribute('aria-expanded',String(this.opened));
    this.trigger.setAttribute('aria-label',count?`Contratos, ${count} propostas novas`:'Contratos');
  }
}
