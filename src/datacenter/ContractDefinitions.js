export const CONTRACT_TEMPLATES=Object.freeze([
  {clientName:'NovaBank',tier:'Banco',rackCount:4,powerPerRackKW:12,maxInletTemperature:32,availability:99.5,termDays:180,installationFee:15000,monthlyFee:28000,loadProfile:'banking'},
  {clientName:'PixelGames',tier:'Streaming',rackCount:8,powerPerRackKW:8,maxInletTemperature:35,availability:99,termDays:180,installationFee:18000,monthlyFee:31000,loadProfile:'streaming'},
  {clientName:'AIForge',tier:'Inteligência artificial',rackCount:3,powerPerRackKW:40,maxInletTemperature:37,availability:98.5,termDays:180,installationFee:30000,monthlyFee:55000,loadProfile:'ai'},
  {clientName:'CloudNorth',tier:'SaaS',rackCount:6,powerPerRackKW:10,maxInletTemperature:34,availability:99.5,termDays:180,installationFee:22000,monthlyFee:42000,loadProfile:'streaming'},
  {clientName:'MedData',tier:'Saúde',rackCount:5,powerPerRackKW:14,maxInletTemperature:31,availability:99.9,termDays:180,installationFee:26000,monthlyFee:49000,loadProfile:'banking'},
  {clientName:'RenderForge',tier:'GPU',rackCount:4,powerPerRackKW:32,maxInletTemperature:35,availability:99,termDays:180,installationFee:28000,monthlyFee:52000,loadProfile:'ai'},
]);

export const CONTRACT_PAYOUT_MULTIPLIER=1.5;
export const CONTRACT_PAYOUT_REVISION=1;

export function createContractOffer(template,index){return {...template,monthlyFee:Math.round(template.monthlyFee*CONTRACT_PAYOUT_MULTIPLIER),id:'offer-'+index,contractId:'contract-'+index};}

export const STARTUP_TEMPLATE=Object.freeze({clientName:'SeedCloud',tier:'Startup',rackCount:2,powerPerRackKW:6,maxInletTemperature:35,availability:99,termDays:180,installationFee:4000,monthlyFee:8000,loadProfile:'streaming'});
export const INTERNATIONAL_TEMPLATE=Object.freeze({clientName:'Atlas International Bank',tier:'Banco internacional',rackCount:28,powerPerRackKW:15,maxInletTemperature:31,availability:99.9,termDays:180,installationFee:150000,monthlyFee:280000,loadProfile:'banking'});
// Generated proposals scale from these fixed templates, leaving existing saved offers untouched.
export const CONTRACT_GROWTH_TIERS=Object.freeze([
  {minimumCapacityKW:0,minimumRacks:0,multiplier:1},
  {minimumCapacityKW:180,minimumRacks:10,multiplier:1.2},
  {minimumCapacityKW:400,minimumRacks:20,multiplier:1.4},
  {minimumCapacityKW:800,minimumRacks:40,multiplier:1.7},
  {minimumCapacityKW:1500,minimumRacks:75,multiplier:2},
  {minimumCapacityKW:2600,minimumRacks:130,multiplier:2.35},
]);
export const CONTRACT_GROWTH_DAY_STEP=12;
export const CONTRACT_EXPANSION_CHANCE=0.1;
export const CONTRACT_EXPANSION_REPUTATION=70;
export const CONTRACT_EXPANSION_SLA_QUIET_DAYS=7;
export const CONTRACT_EXPANSION_CLIENT_COOLDOWN_DAYS=30;
export const CONTRACT_EXPANSION_GROWTH=0.25;
export const THERMAL_SLA_RELIEF_C=5;
export const THERMAL_SLA_REVISION=2;
export const MARKET_BANDS=Object.freeze([
  {minimum:0,minOffers:1,maxOffers:2,weights:[1,0,0]},
  {minimum:30,minOffers:2,maxOffers:3,weights:[.5,.5,0]},
  {minimum:60,minOffers:3,maxOffers:4,weights:[.3,.5,.2]},
  {minimum:80,minOffers:3,maxOffers:5,weights:[.2,.4,.4]},
]);

export function offerExpiryLabel(offer,day){
  const remaining=offer.expiresDay-day;
  return remaining===0?'Expira hoje':remaining<0?'Expirada':'Expira em '+remaining+(remaining===1?' dia':' dias');
}

export function offerDisplayState(offer,day){
  return offer.expiresDay===day?'EXPIRA HOJE':offer.offeredDay===day?'NOVO':'DISPONÍVEL';
}
