import { CONTRACT_PAYOUT_MULTIPLIER, PREMIUM_TEMPLATES, STARTUP_TEMPLATE, INTERNATIONAL_TEMPLATE } from './ContractDefinitions.js';
import { REPUTATION_TIERS, reputationPriceMultiplier, reputationTier } from './ReputationDefinitions.js';

export class ContractGenerator {
  constructor(templates,{random=Math.random}={}){this.templates=templates;this.random=random;}
  eligibleClients(reputation){
    const current=reputationTier(reputation);
    const unlocked=new Set(current.clients);
    const templates=[...this.templates,...PREMIUM_TEMPLATES,STARTUP_TEMPLATE,INTERNATIONAL_TEMPLATE];
    return templates.filter(template=>unlocked.has(template.clientTier)&&reputation>=(template.minimumReputation||0));
  }
  lockedClient(reputation){
    const index=REPUTATION_TIERS.findIndex(tier=>tier.id===reputationTier(reputation).id);
    const next=REPUTATION_TIERS[index+1];
    if(!next)return null;
    const template=[...this.templates,...PREMIUM_TEMPLATES,STARTUP_TEMPLATE,INTERNATIONAL_TEMPLATE].find(item=>next.clients.includes(item.clientTier)&&item.minimumReputation>reputation);
    return template?{...template,locked:true,requiredReputation:template.minimumReputation}:null;
  }
  create(template,{id,day,reputation,growth=1,expiresIn=5,locked=false,vary=false}={}){
    const variation=()=>vary?0.9+this.random()*.2:1;
    const rackCount=Math.max(1,Math.round(template.rackCount*growth*variation()));
    const powerPerRackKW=Math.max(1,Math.round(template.powerPerRackKW*growth*variation()));
    const capacityFactor=(rackCount*powerPerRackKW)/(template.rackCount*template.powerPerRackKW);
    const baseMonthlyFee=Math.round(template.monthlyFee*CONTRACT_PAYOUT_MULTIPLIER*Math.pow(capacityFactor,.75));
    const multiplier=reputationPriceMultiplier(reputation);
    const slaOffset=vary?Math.round((this.random()-.5)*2):0;
    const termDays=vary?(this.random()<.35?120:this.random()<.5?180:240):template.termDays;
    const installationFee=Math.round(template.installationFee*capacityFactor);
    return {...template,rackCount,powerPerRackKW,baseMonthlyFee,reputationMultiplier:multiplier,monthlyFee:Math.round(baseMonthlyFee*multiplier),
      installationFee,maxInletTemperature:Math.max(28,template.maxInletTemperature+slaOffset),termDays,
      minimumReputation:template.minimumReputation||0,offeredDay:day,expiresDay:day+expiresIn,isNew:true,locked:Boolean(locked),
      requiredReputation:locked?(template.minimumReputation||0):undefined,id,contractId:id.replace(/^offer-/,'contract-')};
  }
  generate(template,options){return this.create(template,options);}
}
