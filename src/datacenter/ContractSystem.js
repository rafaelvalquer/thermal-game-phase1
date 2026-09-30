import { CONTRACT_TEMPLATES, STARTUP_TEMPLATE, INTERNATIONAL_TEMPLATE, MARKET_BANDS, CONTRACT_GROWTH_TIERS, CONTRACT_GROWTH_DAY_STEP, CONTRACT_EXPANSION_CHANCE, CONTRACT_EXPANSION_REPUTATION, CONTRACT_EXPANSION_SLA_QUIET_DAYS, CONTRACT_EXPANSION_CLIENT_COOLDOWN_DAYS, CONTRACT_EXPANSION_GROWTH, THERMAL_SLA_RELIEF_C, THERMAL_SLA_REVISION, CONTRACT_PAYOUT_MULTIPLIER, CONTRACT_PAYOUT_PREVIOUS_MULTIPLIER, CONTRACT_PAYOUT_REVISION } from './ContractDefinitions.js';
import { ContractGenerator } from './ContractGenerator.js';
import { reputationPriceMultiplier, reputationTier } from './ReputationDefinitions.js';

export class ContractSystem {
  constructor(state,{random=Math.random}={}){
    this.state=state;this.random=random;this.generator=new ContractGenerator(CONTRACT_TEMPLATES,{random});
    if((state.thermalSlaRevision||0)<THERMAL_SLA_REVISION){
      for(const item of [...state.offers,...state.contracts])if(Number.isFinite(item.maxInletTemperature))item.maxInletTemperature+=THERMAL_SLA_RELIEF_C;
      state.thermalSlaRevision=THERMAL_SLA_REVISION;
    }
    if((state.contractPayoutRevision||0)<CONTRACT_PAYOUT_REVISION){
      const previousRevision=state.contractPayoutRevision||0;
      const factor=previousRevision<1?CONTRACT_PAYOUT_MULTIPLIER:CONTRACT_PAYOUT_MULTIPLIER/CONTRACT_PAYOUT_PREVIOUS_MULTIPLIER;
      for(const item of [...state.offers,...state.contracts]){
        if(Number.isFinite(item.monthlyFee))item.monthlyFee=Math.round(item.monthlyFee*factor);
        if(Number.isFinite(item.baseMonthlyFee))item.baseMonthlyFee=Math.round(item.baseMonthlyFee*factor);
      }
      state.contractPayoutRevision=CONTRACT_PAYOUT_REVISION;
    }
    if((state.reputationPricingRevision||0)<1){
      const multiplier=reputationPriceMultiplier(state.reputation??50);
      for(const offer of state.offers){
        offer.baseMonthlyFee??=Number(offer.monthlyFee)||0;
        offer.reputationMultiplier=multiplier;
        offer.monthlyFee=Math.round(offer.baseMonthlyFee*multiplier);
      }
      for(const contract of state.contracts){
        contract.baseMonthlyFee??=Number(contract.monthlyFee)||0;
        contract.reputationMultiplier??=1;
      }
      state.reputationPricingRevision=1;
    }
    for(const item of [...state.offers,...state.contracts]){
      item.baseMonthlyFee??=Number(item.monthlyFee)||0;
      item.reputationMultiplier??=1;
      item.clientTier??=this.inferClientTier(item);
      item.minimumReputation??=Number.isFinite(item.requiredReputation)?item.requiredReputation:0;
    }
    const day=state.day||1;
    for(const item of [...state.offers,...state.contracts]){
      item.id??=item.status?item.contractId:(item.offerId||item.contractId?.replace(/^contract-/,'offer-'));
      const sequence=Number(/-(\d+)$/.exec(item.id||item.contractId)?.[1])||0;
      state.offerSequence=Math.max(state.offerSequence||0,sequence);
    }
    state.lastExpansionInviteByClient??={};
    for(const contract of state.contracts)if(contract.clientName&&Number(contract.lastExpansionOfferDay)>0)
      state.lastExpansionInviteByClient[contract.clientName]=Math.max(Number(state.lastExpansionInviteByClient[contract.clientName])||0,contract.lastExpansionOfferDay);
    for(const offer of state.offers){
      offer.offeredDay??=day;offer.expiresDay??=day+5;offer.isNew??=false;
    }
    if(!state.marketInitialized){
      const reputation=state.reputation??50,eligible=this.generator.eligibleClients(reputation),band=MARKET_BANDS.findLast(item=>reputation>=item.minimum)||MARKET_BANDS[0];
      const initialCount=Math.min(band.maxOffers,eligible.length);
      for(const template of eligible.slice(0,initialCount))this.addOffer(template,day);
      state.marketInitialized=true;
    }
    state.lastMarketGeneratedDay??=day;
    this.expireOffers(day);
    this.syncContractIndex();
  }
  syncContractIndex(){this.indexedContracts=this.state.contracts;this.contractById=new Map(this.indexedContracts.filter(contract=>contract.id!=null).map(contract=>[contract.id,contract]));}
  getById(id){if(this.indexedContracts!==this.state.contracts)this.syncContractIndex();return this.contractById?.get(id)||null;}
  integer(min,max){return min+Math.floor(this.random()*(max-min+1));}
  inferClientTier(item){
    if(item.clientName===STARTUP_TEMPLATE.clientName)return 'startup';
    if(item.clientName===INTERNATIONAL_TEMPLATE.clientName)return 'hyperscale';
    return CONTRACT_TEMPLATES.find(template=>template.clientName===item.clientName)?.clientTier||'business';
  }
  addOffer(template,day,{vary=false}={}){
    const id='offer-'+(++this.state.offerSequence),reputation=this.state.reputation??50;
    const duration=reputationTier(reputation).expirationRange;
    const offer=this.generator.create(template,{id,day,reputation,expiresIn:this.integer(duration[0],duration[1]),vary});
    this.state.offers.push(offer);return offer;
  }
  generateRenewalOffer(contract,day,reputation=this.state.reputation){
    if(!contract||contract.status!=='completed'||contract.renewalOfferChecked)return null;
    contract.renewalOfferChecked=true;
    const cleanFactor=contract.violationDays?0.5:1;
    const chance=(.15+.75*Math.max(0,Math.min(100,reputation))/100)*cleanFactor;
    if(this.random()>=chance)return null;
    const multiplier=reputationTier(reputation).expirationRange;
    const baseMonthlyFee=Number(contract.baseMonthlyFee)||Number(contract.monthlyFee)||0;
    const offer={...contract,id:'offer-'+(++this.state.offerSequence),contractId:'contract-'+this.state.offerSequence,
      offerId:undefined,status:undefined,completedDay:undefined,renewalOfferChecked:undefined,renewalContractId:contract.id,
      offeredDay:day,expiresDay:day+this.integer(multiplier[0],multiplier[1]),termDays:contract.termDays||180,
      baseMonthlyFee,reputationMultiplier:1,monthlyFee:Math.round(baseMonthlyFee),installationFee:0,isNew:true,locked:false};
    // Renewals reprice the same agreed base with today's reputation; existing terms remain fixed until accepted.
    offer.reputationMultiplier=reputationPriceMultiplier(reputation);offer.monthlyFee=Math.round(baseMonthlyFee*offer.reputationMultiplier);
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
    const count=this.integer(band.minOffers,band.maxOffers),offers=[],eligible=this.generator.eligibleClients(reputation);
    for(let i=0;i<count;i++){
      const growth=this.growthMultiplier(day,reputation);
      const template=eligible[this.integer(0,Math.max(0,eligible.length-1))]||STARTUP_TEMPLATE;
      offers.push(this.addOffer(this.scaleTemplate(template,growth),day,{vary:true}));
    }
    const locked=this.generator.lockedClient(reputation);
    if(locked&&this.random()<.12){
      const growth=this.growthMultiplier(day,reputation),offer=this.addOffer(this.scaleTemplate(locked,growth),day,{vary:true});
      offer.locked=true;offer.requiredReputation=locked.requiredReputation;offers.push(offer);
    }
    this.state.lastMarketGeneratedDay=day;
    return offers;
  }
  generateExpansionOffer(day,reputation=this.state.reputation,violations=new Set()){
    if(this.state.pendingExpansionOffer||reputation<CONTRACT_EXPANSION_REPUTATION)return null;
    const eligible=this.state.contracts.filter(contract=>{
      if(contract.status!=='active'||violations.has(contract.id))return false;
      const lastSlaDay=Number(contract.lastSlaViolationDay)||0,lastInviteDay=Number(this.state.lastExpansionInviteByClient[contract.clientName])||Number(contract.lastExpansionOfferDay)||0;
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
    contract.lastExpansionOfferDay=day;this.state.lastExpansionInviteByClient[contract.clientName]=day;this.state.pendingExpansionOffer=offer;return offer;
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
    if(offer.locked&&(this.state.reputation||0)<offer.requiredReputation)return {ok:false,reason:'Esta oportunidade exige reputação '+offer.requiredReputation+'.'};
    if(cashAvailable<0)return {ok:false,reason:'Capital inválido.'};
    this.state.offers.splice(index,1);
    const renewal=offer.renewalContractId?this.state.contracts.find(item=>item.id===offer.renewalContractId):null;
    if(renewal)renewal.renewalAcceptedDay=day;
    const contract={...offer,offerId:offer.id,offerExpiresDay:offer.expiresDay,isNew:false,status:'installing',acceptedDay:day,expiresDay:day+offer.termDays,installedRacks:0,
      dailyViolation:false,consecutiveViolationDays:0,violationDays:0,activeSeconds:0,uptimeSeconds:0,downtimeSeconds:0,
      dailyActiveSeconds:0,dailyUptimeSeconds:0,dailyDowntimeSeconds:0,
      finesPaid:0,completedDay:null,cancelReason:null};
    this.state.contracts.push(contract);
    this.contractById.set(contract.id,contract);
    return {ok:true,contract,installationIncome:offer.installationFee};
  }
  decline(offerId){
    const key=String(offerId??'').trim();
    const declined=this.state.offers.find(offer=>String(offer.id)===key||String(offer.contractId)===key);
    if(declined?.renewalContractId){const contract=this.state.contracts.find(item=>item.id===declined.renewalContractId);if(contract)contract.renewalDeclinedDay=this.state.day;}
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
