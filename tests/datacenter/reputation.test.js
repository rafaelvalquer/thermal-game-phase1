import test from 'node:test';
import assert from 'node:assert/strict';
import { ReputationSystem } from '../../src/datacenter/ReputationSystem.js';
import { reputationPriceMultiplier, reputationTier } from '../../src/datacenter/ReputationDefinitions.js';
import { ContractSystem } from '../../src/datacenter/ContractSystem.js';
import { CONTRACT_TEMPLATES } from '../../src/datacenter/ContractDefinitions.js';

const market=(reputation,random=()=>0)=>{
  const state={day:1,reputation,offerSequence:0,offers:[],contracts:[],marketInitialized:true,lastMarketGeneratedDay:1};
  return {state,system:new ContractSystem(state,{random})};
};

test('reputation tiers and contract pricing multiplier cover the complete 0–100 range',()=>{
  assert.equal(reputationTier(0).name,'Desconhecido');
  assert.equal(reputationTier(20).name,'Regional');
  assert.equal(reputationTier(40).name,'Confiável');
  assert.equal(reputationTier(60).name,'Referência');
  assert.equal(reputationTier(80).name,'Excelente');
  assert.equal(reputationTier(95).name,'Elite');
  assert.equal(reputationPriceMultiplier(0),.8);
  assert.equal(reputationPriceMultiplier(50),1);
  assert.equal(reputationPriceMultiplier(100),1.2000000000000002);
});

test('reputation clamps changes, caps daily gains at 0.5, and retains only the latest 100 events',()=>{
  const state={reputation:99.8,day:4},system=new ReputationSystem(state);
  const changed=system.change(5,'Conclusão perfeita');
  assert.equal(changed.current,100);assert.equal(changed.tierChanged,false);
  system.startDay();system.changeDaily(.2,'Operação estável');system.changeDaily(.2,'SLA completo');system.changeDaily(.2,'Mais um dia estável');
  assert.equal(state.dailyPositiveReputation,.5);assert.equal(state.reputation,100);
  state.reputation=50;system.startDay();system.changeDaily(.6,'Operação estável');
  assert.equal(state.dailyPositiveReputation,.5);assert.equal(state.reputation,50.5);
  system.startDay();system.changeDaily(.1,'Novo dia estável');
  assert.equal(state.dailyPositiveReputation,.1);assert.equal(state.reputation,50.6);
  state.reputation=50;
  for(let i=0;i<110;i++)system.change(.1,'Evento '+i);
  assert.equal(state.reputationHistory.length,100);
  assert.equal(state.reputationHistory[0].reason,'Evento 10');
});

test('daily proposals apply the reputation price factor while accepted agreements retain their price',()=>{
  for(const reputation of [0,50,100]){
    const {state,system}=market(reputation),template=CONTRACT_TEMPLATES[0],offer=system.addOffer(template,1);
    assert.equal(offer.reputationMultiplier,reputationPriceMultiplier(reputation));
    assert.equal(offer.monthlyFee,Math.round(offer.baseMonthlyFee*reputationPriceMultiplier(reputation)));
    const accepted=system.accept(offer.id,1,1000).contract;
    state.reputation=Math.max(0,Math.min(100,reputation+10));
    assert.equal(accepted.monthlyFee,offer.monthlyFee);
  }
});

test('market shows a disabled next-tier opportunity and refuses it until reputation unlocks',()=>{
  const {state,system}=market(10,()=>.01);
  const generated=system.generateDaily(2),locked=generated.find(offer=>offer.locked);
  assert.ok(locked);assert.equal(locked.requiredReputation,20);
  assert.equal(system.accept(locked.id,2,1000).ok,false);
  state.reputation=20;
  assert.equal(system.accept(locked.id,2,1000).ok,true);
});

test('renewal offers are more likely with high reputation and reprice the same contract base',()=>{
  const completed={id:'contract-old',status:'completed',completedDay:10,clientName:'NovaBank',clientTier:'business',
    rackCount:4,powerPerRackKW:12,monthlyFee:42000,baseMonthlyFee:42000,termDays:180,installationFee:15000,availability:99.5,
    maxInletTemperature:32,violationDays:0};
  const low=market(0,()=>.2);completed.renewalOfferChecked=false;
  assert.equal(low.system.generateRenewalOffer(completed,10,0),null);
  const high=market(100,()=>0);completed.renewalOfferChecked=false;
  const renewal=high.system.generateRenewalOffer(completed,10,100);
  assert.equal(renewal.renewalContractId,completed.id);
  assert.equal(renewal.monthlyFee,50400);
  assert.equal(renewal.installationFee,0);
  const accepted=high.system.accept(renewal.id,10,0);
  assert.equal(accepted.ok,true);assert.equal(accepted.contract.status,'installing');
  assert.equal(accepted.contract.expiresDay,10+renewal.termDays);
  assert.equal(accepted.contract.renewalContractId,completed.id);
});

test('reputation history survives ordinary serialized state round trips',()=>{
  const state={reputation:49.5,day:8},reputation=new ReputationSystem(state);
  reputation.change(.5,'SLA mensal completo',8);
  const restored=new ReputationSystem(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.value,50);
  assert.deepEqual(restored.state.reputationHistory,state.reputationHistory);
});

test('a saved legacy offer migrates its reputation price once while signed contract terms stay fixed',()=>{
  const state={day:1,reputation:80,offerSequence:1,contractPayoutRevision:1,marketInitialized:true,lastMarketGeneratedDay:1,
    offers:[{id:'offer-1',clientName:'NovaBank',monthlyFee:42000}],
    contracts:[{id:'contract-1',clientName:'NovaBank',status:'active',monthlyFee:42000}]};
  new ContractSystem(state);
  assert.equal(state.offers[0].monthlyFee,51744);
  assert.equal(state.offers[0].baseMonthlyFee,46200);
  assert.equal(state.contracts[0].monthlyFee,46200);
  new ContractSystem(state);
  assert.equal(state.offers[0].monthlyFee,51744);
  assert.equal(state.contracts[0].monthlyFee,46200);
});
