export const REPUTATION_MIN = 0;
export const REPUTATION_MAX = 100;
export const REPUTATION_DAILY_POSITIVE_CAP = 0.5;
export const REPUTATION_HISTORY_LIMIT = 100;
export const REPUTATION_PRICE_BASE = 0.8;
export const REPUTATION_PRICE_PER_POINT = 0.004;

export const REPUTATION_TIERS = Object.freeze([
  { id:'unknown', name:'Desconhecido', minimum:0, maximum:19, offerRange:[0,1], expirationRange:[2,4], clients:['startup','small'] },
  { id:'regional', name:'Regional', minimum:20, maximum:39, offerRange:[1,2], expirationRange:[3,5], clients:['startup','small','business'] },
  { id:'trusted', name:'Confiável', minimum:40, maximum:59, offerRange:[1,3], expirationRange:[3,6], clients:['small','business','corporate'] },
  { id:'reference', name:'Referência', minimum:60, maximum:79, offerRange:[2,4], expirationRange:[4,7], clients:['business','corporate','enterprise'] },
  { id:'excellent', name:'Excelente', minimum:80, maximum:94, offerRange:[3,5], expirationRange:[4,8], clients:['corporate','enterprise','premium'] },
  { id:'elite', name:'Elite', minimum:95, maximum:100, offerRange:[4,6], expirationRange:[5,10], clients:['enterprise','premium','hyperscale'] },
]);

export function reputationTier(value){
  const score=Math.max(REPUTATION_MIN,Math.min(REPUTATION_MAX,Number(value)||0));
  return REPUTATION_TIERS.findLast(tier=>score>=tier.minimum)||REPUTATION_TIERS[0];
}

export function reputationPriceMultiplier(value){
  return REPUTATION_PRICE_BASE+Math.max(REPUTATION_MIN,Math.min(REPUTATION_MAX,Number(value)||0))*REPUTATION_PRICE_PER_POINT;
}
