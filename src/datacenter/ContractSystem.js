import { CONTRACT_TEMPLATES, createContractOffer } from './ContractDefinitions.js';

export class ContractSystem {
  constructor(state){
    this.state=state;
    if(!state.marketInitialized){this.refreshMarket(true);state.marketInitialized=true;}
  }
  refreshMarket(initial=false){
    while(this.state.offers.length<(initial?3:3)){
      const index=++this.state.offerSequence,template=CONTRACT_TEMPLATES[(index-1)%CONTRACT_TEMPLATES.length];
      this.state.offers.push(createContractOffer(template,index));
    }
  }
  accept(offerId,day,cashAvailable){
    const key=String(offerId??'').trim();
    const index=this.state.offers.findIndex(offer=>String(offer.id)===key||String(offer.contractId)===key);
    if(index<0){
      const existing=this.state.contracts.find(contract=>[contract.id,contract.offerId,contract.contractId].some(id=>String(id)===key));
      if(existing)return {ok:true,alreadyAccepted:true,contract:existing,installationIncome:0};
      return {ok:false,reason:'Esta oferta não está mais disponível. Atualize o mercado para ver as ofertas atuais.'};
    }
    const offer=this.state.offers[index];
    if(cashAvailable<0)return {ok:false,reason:'Capital inválido.'};
    this.state.offers.splice(index,1);
    const contract={...offer,status:'installing',acceptedDay:day,expiresDay:day+offer.termDays,installedRacks:0,
      dailyViolation:false,consecutiveViolationDays:0,violationDays:0,activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0,
      dailyActiveSeconds:0,dailyUptimeSeconds:0,dailyDowntimeSeconds:0,
      finesPaid:0,completedDay:null,cancelReason:null};
    this.state.contracts.push(contract);
    return {ok:true,contract,installationIncome:offer.installationFee};
  }
  decline(offerId){
    const key=String(offerId??'').trim();
    const before=this.state.offers.length;this.state.offers=this.state.offers.filter(offer=>String(offer.id)!==key&&String(offer.contractId)!==key);
    return before!==this.state.offers.length;
  }
  nextInstallation(){return this.state.contracts.find(contract=>contract.status==='installing'&&contract.installedRacks<contract.rackCount)||null;}
  attachRack(rack){
    const contract=this.state.contracts.find(item=>item.id===rack.contractId);
    if(!contract||contract.status==='cancelled'||contract.status==='completed')return;
    contract.installedRacks=Math.min(contract.rackCount,contract.installedRacks+1);
    if(contract.installedRacks>=contract.rackCount){contract.status='active';contract.activeFromDay=this.state.day;}
  }
  cancel(contractId,reason='Cancelado pelo operador'){
    const contract=this.state.contracts.find(item=>item.id===contractId&&['installing','active'].includes(item.status));
    if(!contract)return false;
    contract.status='cancelled';contract.cancelReason=reason;contract.cancelledDay=this.state.day;return true;
  }
  updateDay(day){
    this.state.day=day;
    if(day>1&&(day-1)%7===0)this.refreshMarket();
    for(const contract of this.state.contracts){
      if(contract.status==='installing'&&day>=contract.expiresDay){this.cancel(contract.id,'Prazo de instalação expirado');continue;}
      if(contract.status!=='active')continue;
      if(contract.dailyViolation){
        contract.violationDays++;contract.consecutiveViolationDays++;
      }else contract.consecutiveViolationDays=0;
      contract.dailyViolation=false;
      contract.dailyActiveSeconds=0;contract.dailyUptimeSeconds=0;contract.dailyDowntimeSeconds=0;
      if(day>=contract.expiresDay){contract.status='completed';contract.completedDay=day;continue;}
      if(contract.consecutiveViolationDays>=3)this.cancel(contract.id,'SLA violado por três dias consecutivos');
    }
  }
}
