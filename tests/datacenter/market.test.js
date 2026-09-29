import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractSystem } from '../../src/datacenter/ContractSystem.js';
import { CONTRACT_TEMPLATES, INTERNATIONAL_TEMPLATE, STARTUP_TEMPLATE } from '../../src/datacenter/ContractDefinitions.js';

const market=(reputation,random=()=>0)=>{
  const state={day:1,reputation,offerSequence:0,offers:[],contracts:[],marketInitialized:true,lastMarketGeneratedDay:1};
  return {state,system:new ContractSystem(state,{random})};
};

test('daily proposal count follows every reputation band',()=>{
  for(const [reputation,min,max] of [[0,1,2],[29,1,2],[30,2,3],[59,2,3],[60,3,4],[79,3,4],[80,3,5],[100,3,5]]){
    const low=market(reputation,()=>0),high=market(reputation,()=>.999);
    for(const [{state,system},expected] of [[low,min],[high,max]]){
      const generated=system.generateDaily(2);
      assert.equal(generated.filter(offer=>!offer.locked).length,expected,`${reputation}: expected ${expected}, got ${generated.length}`);
      assert.equal(state.offers.length,generated.length);
      assert.equal(system.generateDaily(2).length,0,'same day must not generate twice');
    }
  }
});

test('reputation unlocks only eligible client categories and creates premium opportunities at high tiers',()=>{
  const low=market(10,()=>.99),mid=market(40,()=>.99),high=market(99,()=>.99);
  assert.ok(low.system.generateDaily(2).every(offer=>['startup','small'].includes(offer.clientTier)));
  assert.ok(mid.system.generateDaily(2).every(offer=>['small','business','corporate'].includes(offer.clientTier)));
  assert.ok(high.system.generateDaily(2).some(offer=>offer.clientTier==='hyperscale'));
});

test('new offers grow in racks, power, and pay with infrastructure and elapsed days',()=>{
  const small=market(50,()=>0);
  small.state.rackCount=4;small.state.powerCapacityKW=100;
  const early=small.system.generateDaily(2)[0];

  const expanded=market(50,()=>0);
  expanded.state.rackCount=30;expanded.state.powerCapacityKW=650;
  const later=expanded.system.generateDaily(42)[0];

  assert.ok(later.rackCount>early.rackCount);
  assert.ok(later.powerPerRackKW>early.powerPerRackKW);
  assert.ok(later.monthlyFee>early.monthlyFee);
  assert.ok(later.installationFee>early.installationFee);
  assert.equal(early.clientName,later.clientName,'growth scales the selected customer model');
});

test('offers remain at base scale until both infrastructure and day progression unlock growth',()=>{
  const {state,system}=market(50,()=>0);
  const early=system.generateDaily(2)[0];
  assert.ok(early.rackCount>=1&&early.rackCount<=Math.ceil(CONTRACT_TEMPLATES[0].rackCount*1.1));
  assert.ok(early.powerPerRackKW>=1&&early.powerPerRackKW<=Math.ceil(CONTRACT_TEMPLATES[0].powerPerRackKW*1.1));
});

test('new offers price from a contract base and saved legacy fees migrate only once',()=>{
  const nova=CONTRACT_TEMPLATES.find(item=>item.clientName==='NovaBank');
  const offer=market(50).system.addOffer(nova,1);
  assert.equal(offer.baseMonthlyFee,42000);
  assert.equal(offer.monthlyFee,42000,'reputation 50 applies a neutral 1.00 multiplier');

  const state={day:1,reputation:75,offerSequence:1,marketInitialized:true,lastMarketGeneratedDay:1,
    offers:[{id:'offer-1',monthlyFee:28000}],contracts:[{id:'contract-1',status:'active',monthlyFee:8000}]};
  new ContractSystem(state);
  assert.equal(state.offers[0].monthlyFee,46200);
  assert.equal(state.contracts[0].monthlyFee,12000);
  assert.equal(state.offers[0].baseMonthlyFee,42000);
  assert.equal(state.offers[0].reputationMultiplier,1.1);
  assert.equal(state.contractPayoutRevision,1);
  new ContractSystem(state);
  assert.equal(state.offers[0].monthlyFee,46200);
  assert.equal(state.contracts[0].monthlyFee,12000);
});

test('new offers receive warmer thermal SLAs and saved contracts are relieved once',()=>{
  assert.equal(CONTRACT_TEMPLATES.find(item=>item.clientName==='NovaBank').maxInletTemperature,32);
  assert.equal(STARTUP_TEMPLATE.maxInletTemperature,35);
  assert.equal(INTERNATIONAL_TEMPLATE.maxInletTemperature,31);

  const state={day:1,reputation:50,offerSequence:1,marketInitialized:true,lastMarketGeneratedDay:1,
    offers:[{id:'offer-1',maxInletTemperature:27}],
    contracts:[{id:'contract-1',status:'active',maxInletTemperature:30}]};
  new ContractSystem(state);
  assert.equal(state.offers[0].maxInletTemperature,32);
  assert.equal(state.contracts[0].maxInletTemperature,35);
  new ContractSystem(state);
  assert.equal(state.offers[0].maxInletTemperature,32);
  assert.equal(state.contracts[0].maxInletTemperature,35);
});

test('offers keep accumulating with unique identifiers and expire between three and seven days',()=>{
  const {state,system}=market(80,()=>.999);
  const first=system.generateDaily(2),second=system.generateDaily(3);
  assert.equal(first.length,5);assert.equal(second.length,5);
  assert.equal(state.offers.length,10);
  assert.equal(new Set(state.offers.map(offer=>offer.id)).size,10);
  assert.ok(state.offers.every(offer=>offer.expiresDay-offer.offeredDay===8));
  assert.ok(state.offers.every(offer=>offer.isNew));
});

test('offer is acceptable through its expiry day and keeps contract term separate',()=>{
  const {state,system}=market(50,()=>0);
  const offer=system.generateDaily(2)[0];
  offer.expiresDay=5;
  const accepted=system.accept(offer.id,5,1000);
  assert.equal(accepted.ok,true);
  assert.equal(accepted.contract.offerExpiresDay,5);
  assert.equal(accepted.contract.expiresDay,5+offer.termDays);
});

test('offer past its deadline cannot be accepted',()=>{
  const {system}=market(50,()=>0);
  const offer=system.generateDaily(2)[0];offer.expiresDay=2;
  assert.equal(system.accept(offer.id,3,1000).ok,false);
});

test('expansion invitations require reputation, seven clean SLA days, and a 30-day client cooldown',()=>{
  let draws=0;const {state,system}=market(70,()=>{draws++;return 0.05;});
  const contract={id:'contract-1',clientName:'NovaBank',status:'active',rackCount:4,powerPerRackKW:12,monthlyFee:42000,installationFee:15000,termDays:180,expiresDay:90,lastSlaViolationDay:13,lastExpansionOfferDay:1};
  state.contracts.push(contract);
  assert.equal(system.generateExpansionOffer(20,70),null,'a violation seven days ago is still inside the quiet window');
  assert.equal(draws,0,'ineligible contracts do not consume the random roll');
  assert.equal(system.generateExpansionOffer(21,70),null,'the last invitation was less than 30 days ago');
  contract.lastSlaViolationDay=0;
  assert.equal(system.generateExpansionOffer(30,69),null,'low reputation blocks invitations');
  assert.equal(system.generateExpansionOffer(30,70),null,'29 days is still inside cooldown');
  assert.ok(system.generateExpansionOffer(31,70),'the invitation becomes eligible at the 30-day boundary');
  assert.equal(draws,3);
});

test('eligible clients receive one persisted moderate expansion proposal with proportional terms',()=>{
  const values=[0.05,0,0.1],{state,system}=market(75,()=>values.shift()??0);
  const contract={id:'contract-client',clientName:'NovaBank',status:'active',rackCount:4,powerPerRackKW:12,monthlyFee:42000,installationFee:15000,termDays:180,expiresDay:90};
  state.contracts.push(contract);
  const offer=system.generateExpansionOffer(20,75);
  assert.equal(offer.expansionType,'racks');assert.equal(offer.contractId,contract.id);
  assert.equal(offer.rackCount,5);assert.equal(offer.powerPerRackKW,12);
  assert.equal(offer.currentCapacityKW,48);assert.equal(offer.capacityKW,60);assert.equal(offer.capacityIncreaseKW,12);
  assert.equal(offer.monthlyFee,52500);assert.equal(offer.monthlyIncrease,10500);
  assert.equal(offer.installationFee,3750);assert.equal(offer.expiresDay,200);
  assert.equal(state.pendingExpansionOffer,offer);assert.equal(contract.lastExpansionOfferDay,20);
  assert.equal(system.generateExpansionOffer(21,90),null,'only one expansion can remain pending');
});

test('capacity expansion offers raise power per rack by about 25 percent',()=>{
  const values=[0.05,0,.9],{state,system}=market(80,()=>values.shift()??0);
  state.contracts.push({id:'contract-power',clientName:'AI Forge',status:'active',rackCount:4,powerPerRackKW:12,monthlyFee:42000,installationFee:15000,termDays:180,expiresDay:90});
  const offer=system.generateExpansionOffer(10,80);
  assert.equal(offer.expansionType,'power');assert.equal(offer.rackCount,4);assert.equal(offer.powerPerRackKW,15);
  assert.equal(offer.capacityKW,60);assert.equal(offer.monthlyFee,52500);assert.equal(offer.installationFee,3750);
});

test('expansion cooldown applies across separate active contracts for the same customer',()=>{
  const values=[0.01,0,0.1,0.01,0,0.1],{state,system}=market(80,()=>values.shift()??0);
  for(const id of ['contract-one','contract-two'])state.contracts.push({id,clientName:'Shared Client',status:'active',rackCount:4,powerPerRackKW:12,monthlyFee:42000,installationFee:15000,termDays:180,expiresDay:90});
  assert.ok(system.generateExpansionOffer(1,80));state.pendingExpansionOffer=null;
  assert.equal(system.generateExpansionOffer(30,80),null,'another contract for the same client shares the 30-day cooldown');
  assert.ok(system.generateExpansionOffer(31,80),'the client can receive another invitation after 30 days');
});

test('a current SLA violation blocks its customer and the event probability is capped at ten percent',()=>{
  let draws=0;const {state,system}=market(80,()=>{draws++;return .1;});
  const contract={id:'contract-risk',clientName:'At Risk',status:'active',rackCount:4,powerPerRackKW:12,monthlyFee:42000,installationFee:15000,termDays:180,expiresDay:90};
  state.contracts.push(contract);
  assert.equal(system.generateExpansionOffer(20,80,new Set([contract.id])),null);
  assert.equal(draws,0,'a same-day SLA violation blocks this contract before the chance roll');
  assert.equal(system.generateExpansionOffer(20,80),null,'a roll at the 10% boundary does not exceed the cap');
  assert.equal(draws,1);
});
