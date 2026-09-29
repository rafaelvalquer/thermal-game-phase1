import { REPUTATION_DAILY_POSITIVE_CAP, REPUTATION_HISTORY_LIMIT, REPUTATION_MAX, REPUTATION_MIN, reputationTier } from './ReputationDefinitions.js';

export class ReputationSystem {
  constructor(state){
    this.state=state;
    state.reputation=Math.max(REPUTATION_MIN,Math.min(REPUTATION_MAX,Number(state.reputation??50)));
    state.reputationHistory=Array.isArray(state.reputationHistory)?state.reputationHistory.slice(-REPUTATION_HISTORY_LIMIT):[];
    state.dailyPositiveReputation=Math.max(0,Number(state.dailyPositiveReputation)||0);
    state.reputationStreakDays=Math.max(0,Number(state.reputationStreakDays)||0);
  }
  get value(){return this.state.reputation;}
  get tier(){return reputationTier(this.value);}
  change(amount,reason,day=this.state.day||1){
    const previous=this.value,oldTier=reputationTier(previous),requested=Number(amount)||0;
    const current=Math.max(REPUTATION_MIN,Math.min(REPUTATION_MAX,previous+requested));
    const delta=current-previous;
    this.state.reputation=current;
    if(delta!==0){
      this.state.reputationHistory.push({day,change:delta,value:current,reason:String(reason||'Ajuste de reputação')});
      if(this.state.reputationHistory.length>REPUTATION_HISTORY_LIMIT)this.state.reputationHistory.splice(0,this.state.reputationHistory.length-REPUTATION_HISTORY_LIMIT);
    }
    const newTier=reputationTier(current);
    const tierChanged=oldTier.id!==newTier.id;
    if(tierChanged)this.state.reputationTierNotification={day,oldTier:oldTier.name,newTier:newTier.name};
    return {previous,current,delta,oldTier,newTier,tierChanged};
  }
  changeDaily(amount,reason,day=this.state.day||1){
    const requested=Number(amount)||0;
    if(requested>0){
      const remaining=Math.max(0,REPUTATION_DAILY_POSITIVE_CAP-this.state.dailyPositiveReputation);
      const applied=Math.min(requested,remaining);
      if(!applied)return {previous:this.value,current:this.value,delta:0,oldTier:this.tier,newTier:this.tier,tierChanged:false};
      this.state.dailyPositiveReputation+=applied;
      return this.change(applied,reason,day);
    }
    return this.change(requested,reason,day);
  }
  startDay(){this.state.dailyPositiveReputation=0;}
}
