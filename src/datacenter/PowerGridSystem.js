export const POWER_TIERS=Object.freeze([
  {capacityKW:100,installationCost:0,monthlyFixedCost:3000},
  {capacityKW:250,installationCost:50000,monthlyFixedCost:7000},
  {capacityKW:500,installationCost:120000,monthlyFixedCost:12000},
  {capacityKW:1000,installationCost:300000,monthlyFixedCost:25000},
  {capacityKW:2000,installationCost:700000,monthlyFixedCost:45000},
  {capacityKW:5000,installationCost:1600000,monthlyFixedCost:85000},
]);

export class PowerGridSystem {
  constructor({capacityKW=100}={}){this.capacityKW=capacityKW;}
  get tier(){return POWER_TIERS.find(item=>item.capacityKW===this.capacityKW)||POWER_TIERS[0];}
  get nextTier(){return POWER_TIERS.find(item=>item.capacityKW>this.capacityKW)||null;}
  upgrade(tier,cash){
    const target=typeof tier==='number'?POWER_TIERS.find(item=>item.capacityKW===tier):tier;
    if(!target||target.capacityKW<=this.capacityKW)return {ok:false,reason:'Selecione uma capacidade superior.'};
    if(cash<target.installationCost)return {ok:false,reason:'Capital insuficiente para ampliar a rede elétrica.'};
    this.capacityKW=target.capacityKW;return {ok:true,cost:target.installationCost,tier:target};
  }
}
