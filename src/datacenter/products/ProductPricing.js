import { reputationPriceMultiplier } from '../ReputationDefinitions.js';

export function priceComputeProduct(product,{growth=1,reputation=0,termDays=product.termDays}={}){
  const scale=Math.max(1,Math.min(3,Number(growth)||1)),termFactor=termDays>=240?1.08:termDays<=120?.94:1;
  const baseMonthlyFee=Math.round(product.monthlyBase*Math.pow(scale,.78)*termFactor);
  return {baseMonthlyFee,reputationMultiplier:reputationPriceMultiplier(reputation),monthlyFee:Math.round(baseMonthlyFee*reputationPriceMultiplier(reputation)),
    installationFee:Math.round(product.setupBase*Math.pow(scale,.7))};
}
