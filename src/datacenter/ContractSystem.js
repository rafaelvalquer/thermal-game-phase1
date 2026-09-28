import { CONTRACT_TEMPLATES, createContractOffer, STARTUP_TEMPLATE, INTERNATIONAL_TEMPLATE, MARKET_BANDS, CONTRACT_GROWTH_TIERS, CONTRACT_GROWTH_DAY_STEP, CONTRACT_EXPANSION_CHANCE, CONTRACT_EXPANSION_REPUTATION, CONTRACT_EXPANSION_SLA_QUIET_DAYS, CONTRACT_EXPANSION_CLIENT_COOLDOWN_DAYS, CONTRACT_EXPANSION_GROWTH, THERMAL_SLA_RELIEF_C, THERMAL_SLA_REVISION, CONTRACT_PAYOUT_MULTIPLIER, CONTRACT_PAYOUT_REVISION } from './ContractDefinitions.js';

export class ContractSystem {
  constructor(state,{random=Math.random}={}){
    this.state=state;this.random=random;
    if((state.thermalSlaRevision||0)<THERMAL_SLA_REVISION){
      for(const item of [...state.offers,...state.contracts])if(Number.isFinite(item.maxInletTemperature))item.maxInletTemperature+=THERMAL_SLA_RELIEF_C;
      state.thermalSlaRevision=THERMAL_SLA_REVISION;
    }
    if((state.contractPayoutRevision||0)<CONTRACT_PAYOUT_REVISION){
      for(const item of [...state.offers,...state.contracts])if(Number.isFinite(item.monthlyFee))item.monthlyFee=Math.round(item.monthlyFee*CONTRACT_PAYOUT_MULTIPLIER);
      state.contractPayoutRevision=CONTRACT_PAYOUT_REVISION;
    }
    const day=state.day||1;
    for(const item of [...state.offers,...state.contracts]){
      item.id??=item.status?item.contractId:(item.offerId||item.contractId?.replace(/^contract-/,'offer-'));
      const sequence=Number(/-(\d+)$/.exec(item.id||item.contractId)?.[1])||0;
      state.offerSequence=Math.max(state.offerSequence||0,sequence);
    }
    for(const offer of state.offers){
      offer.offeredDay??=day;offer.expiresDay??=day+5;offer.isNew??=false;
    }
    if(!state.marketInitialized){
      for(const template of CONTRACT_TEMPLATES.slice(0,3))this.addOffer(template,day);
      state.marketInitialized=true;
    }
    state.lastMarketGeneratedDay??=day;
    this.expireOffers(day);
  }
  integer(min,max){return min+Math.floor(this.random()*(max-min+1));}
  addOffer(template,day){
    const offer={...createContractOffer(template,++this.state.offerSequence),offeredDay:day,expiresDay:day+this.integer(3,7),isNew:true};
    this.state.offers.push(offer);return offer;
  }
  growthMultiplier(day,reputation=this.state.reputation){
    const elapsedGrowth=Math.floor(Math.max(0,day-1)/CONTRACT_GROWTH_DAY_STEP);
    const reputationGrowth=Math.floor(Math.max(0,reputation-30)/20);
    const installedRacks=Math.max(0,this.state.rackCount||0);
    const capacityKW=Math.max(0,this.state.powerCapacityKW||0);
    const infrastructureTier=CONTRACT_GROWTH_TIERS.reduce((tier,item)=>
      installedRacks>=item.minimumRacks&&capacityKW>=item.minimumCapacityKW?item.multiplier:tier,1);
    return Math.min(3,infrastructureTier*(1+Math.min(6,elapsedGrowth+reputationGrowth)*.08));
  }
  scaleTemplate(template,multiplier){
    if(multiplier<=1)return template;
    const scaleCount=value=>Math.max(1,Math.round(value*multiplier));
    return {...template,
      tier:multiplier>=1.4?'Expansão · '+template.tier:template.tier,
      rackCount:scaleCount(template.rackCount),
      powerPerRackKW:scaleCount(template.powerPerRackKW),
      installationFee:Math.round(template.installationFee*multiplier),
      monthlyFee:Math.round(template.monthlyFee*multiplier)};
  }
  expireOffers(day){this.state.offers=this.state.offers.filter(offer=>offer.expiresDay>=day);}
  generateDaily(day,reputation=this.state.reputation){
    if(day<=this.state.lastMarketGeneratedDay)return [];
    this.expireOffers(day);
    const band=MARKET_BANDS.findLast(item=>reputation>=item.minimum)||MARKET_BANDS[0];
    const count=this.integer(band.minOffers,band.maxOffers),offers=[];
    for(let i=0;i<count;i++){
      const roll=this.random();
      const template=roll<band.weights[0]?STARTUP_TEMPLATE:roll<band.weights[0]+band.weights[1]
        ?CONTRACT_TEMPLATES[this.integer(0,CONTRACT_TEMPLATES.length-1)]:INTERNATIONAL_TEMPLATE;
      const growth=this.growthMultiplier(day,reputation);
      offers.push(this.addOffer(this.scaleTemplate(template,growth),day));
    }
    this.state.lastMarketGeneratedDay=day;
    return offers;
  }
  generateExpansionOffer(day,reputation=this.state.reputation,violations=new Set()){
    if(this.state.pendingExpansionOffer||reputation<CONTRACT_EXPANSION_REPUTATION)return null;
    const eligible=this.state.contracts.filter(contract=>{
      if(contract.status!=='active'||violations.has(contract.id))return false;
      const lastSlaDay=Number(contract.lastSlaViolationDay)||0,lastInviteDay=Number(contract.lastExpansionOfferDay)||0;
      return (!lastSlaDay||day-lastSlaDay>CONTRACT_EXPANSION_SLA_QUIET_DAYS)&&
        (!lastInviteDay||day-lastInviteDay>=CONTRACT_EXPANSION_CLIENT_COOLDOWN_DAYS);
    });
    if(!eligible.length||this.random()>=CONTRACT_EXPANSION_CHANCE)return null;
    const contract=eligible[this.integer(0,eligible.length-1)],increaseRacks=this.random()<.5;
    const currentRackCount=contract.rackCount,currentPowerPerRackKW=contract.powerPerRackKW;
    const rackCount=increaseRacks?currentRackCount+Math.max(1,Math.round(currentRackCount*CONTRACT_EXPANSION_GROWTH)):currentRackCount;
    const powerPerRackKW=increaseRacks?currentPowerPerRackKW:currentPowerPerRackKW+Math.max(1,Math.round(currentPowerPerRackKW*CONTRACT_EXPANSION_GROWTH));
    const currentCapacityKW=currentRackCount*currentPowerPerRackKW,capacityKW=rackCount*powerPerRackKW;
    const capacityIncreaseKW=capacityKW-currentCapacityKW,monthlyFee=Math.round(contract.monthlyFee*capacityKW/currentCapacityKW);
    const installationFee=Math.round((contract.installationFee||0)*capacityIncreaseKW/currentCapacityKW);
    const offer={id:'expansion-'+contract.id+'-'+day,contractId:contract.id,clientName:contract.clientName,expansionType:increaseRacks?'racks':'power',
      offeredDay:day,currentRackCount,currentPowerPerRackKW,currentCapacityKW,currentMonthlyFee:contract.monthlyFee,
      currentInstallationFee:contract.installationFee||0,currentExpiresDay:contract.expiresDay,
      rackCount,powerPerRackKW,capacityKW,capacityIncreaseKW,monthlyFee,monthlyIncrease:monthlyFee-contract.monthlyFee,
      installationFee,expiresDay:day+contract.termDays,termDays:contract.termDays};
    contract.lastExpansionOfferDay=day;this.state.pendingExpansionOffer=offer;return offer;
  }
  markSeen(ids){
    const seen=new Set(ids);let changed=false;
    for(const offer of this.state.offers)if(offer.isNew&&seen.has(offer.id)){offer.isNew=false;changed=true;}
    return changed;
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
    if(day>offer.expiresDay)return {ok:false,reason:'Esta oferta expirou e não pode mais ser aceita.'};
    if(cashAvailable<0)return {ok:false,reason:'Capital inválido.'};
    this.state.offers.splice(index,1);
    const contract={...offer,offerId:offer.id,offerExpiresDay:offer.expiresDay,isNew:false,status:'installing',acceptedDay:day,expiresDay:day+offer.termDays,installedRacks:0,
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
  nextInstallation(){return this.state.contracts.find(contract=>contract.status==='installing'&&contract.installedRacks<contract.rackCount)||this.state.contracts.find(contract=>contract.status==='active'&&contract.installedRacks<contract.rackCount)||null;}
  attachRack(rack){
    const contract=this.state.contracts.find(item=>item.id===rack.contractId);
    if(!contract||contract.status==='cancelled'||contract.status==='completed')return;
    contract.installedRacks=Math.min(contract.rackCount,contract.installedRacks+1);
    if(contract.status==='installing'&&contract.installedRacks>=contract.rackCount){contract.status='active';contract.activeFromDay=this.state.day;}
  }
  cancel(contractId,reason='Cancelado pelo operador'){
    const contract=this.state.contracts.find(item=>item.id===contractId&&['installing','active'].includes(item.status));
    if(!contract)return false;
    contract.status='cancelled';contract.cancelReason=reason;contract.cancelledDay=this.state.day;return true;
  }
  updateDay(day){
    this.state.day=day;
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
