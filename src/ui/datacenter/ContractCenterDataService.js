import { offerDisplayState,offerExpiryLabel } from '../../datacenter/ContractDefinitions.js';
import { computeFinancialPreview } from '../../datacenter/contracts/ContractFinancialPreview.js';
import { ContractEquipmentResolver } from './ContractEquipmentResolver.js';
import { classifyContract } from './ContractStatsSelectors.js';

export const escapeContractHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
export const formatContractMoney=value=>'R$ '+Math.round(finite(value)).toLocaleString('pt-BR');
export const formatContractDaily=value=>'R$ '+(finite(value)/30).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export const formatContractKw=value=>finite(value).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+' kW';
export function contractRequirements(item){
  if(item.modality!=='compute')return `${finite(item.rackCount)} rack(s) · ${formatContractKw(finite(item.rackCount)*finite(item.powerPerRackKW))}`;
  const request=item.computeRequirements||{};return [request.vcpu&&`${request.vcpu} vCPU`,request.ramGB&&`${request.ramGB} GB RAM`,request.gpuCount&&`${request.gpuCount} GPU(s) · ${request.gpuMinVramGB||0} GB/GPU`,request.storageTB&&`${request.storageTB} TB storage`].filter(Boolean).join(' · ')||'Sem recursos computacionais';
}
export class ContractCenterDataService {
  constructor(manager){this.manager=manager;this.equipment=new ContractEquipmentResolver(manager.world);}
  validOffers(){return this.manager.state.offers.filter(offer=>finite(offer.expiresDay)>=this.manager.clock.day);}
  newOfferCount(){return this.validOffers().filter(offer=>offer.isNew===true).length;}
  analyze(offer){
    if(offer.modality==='compute'){
      const plan=this.manager.planComputeOffer(offer),preview=computeFinancialPreview({...offer,world:this.manager.world},plan,{energyTariff:this.manager.state.energyTariff,coolingReserveKW:this.manager.availableCoolingKW});
      return {plan,preview,ok:Boolean(plan.ok),missing:plan.missing||[],reason:plan.reason||null};
    }
    const power=finite(offer.rackCount)*finite(offer.powerPerRackKW),missing=[];
    if(power>this.manager.availableEnergyKW+1e-6)missing.push({resource:'Potência elétrica',requested:power,available:this.manager.availableEnergyKW,missing:power-this.manager.availableEnergyKW,unit:'kW'});
    if(power>this.manager.availableCoolingContractsKW+1e-6)missing.push({resource:'Capacidade térmica',requested:power,available:this.manager.availableCoolingContractsKW,missing:power-this.manager.availableCoolingContractsKW,unit:'kW'});
    const locked=Boolean(offer.locked&&(this.manager.state.reputation||0)<offer.requiredReputation);
    return {plan:{ok:missing.length===0&&!locked,allocations:[],missing},preview:null,ok:missing.length===0&&!locked,missing,locked,reason:locked?'Exige reputação '+offer.requiredReputation+'.':missing.length?'Infraestrutura elétrica ou térmica insuficiente.':null};
  }
  offerState(offer){return {label:offerDisplayState(offer,this.manager.clock.day),expiry:offerExpiryLabel(offer,this.manager.clock.day),analysis:this.analyze(offer)};}
  contractState(contract){return classifyContract(contract,this.manager);}
  resolveEquipment(contract){return this.equipment.resolve(contract);}
  markMarketViewed(){const offers=this.validOffers().filter(offer=>offer.isNew).map(offer=>offer.id);if(offers.length)this.manager.markOffersSeen(offers);return offers.length;}
}
