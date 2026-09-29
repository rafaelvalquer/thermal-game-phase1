export const COOLING_UNIT_BALANCE_REVISION=2;

export const COOLING_UNIT_MODELS=Object.freeze({
  compact:Object.freeze({label:'Compacta',cost:4000,ratedCoolingCapacity:10000,maxAirFlow:1.2,cop:3.5,fanPower:300}),
  commercial:Object.freeze({label:'Comercial',cost:8000,ratedCoolingCapacity:55000,maxAirFlow:6,cop:4.5,fanPower:700}),
  industrial:Object.freeze({label:'Industrial',cost:14000,ratedCoolingCapacity:110000,maxAirFlow:12,cop:4.2,fanPower:1400}),
});

export function migrateCoolingUnitBalance(properties={}){
  const migrated={...properties};
  if((Number(migrated.coolingBalanceRevision)||0)>=COOLING_UNIT_BALANCE_REVISION)return migrated;
  const oldDefaults={
    commercial:{ratedCoolingCapacity:25000,maxAirFlow:2.5,cop:3.5,fanPower:700},
    industrial:{ratedCoolingCapacity:50000,maxAirFlow:5,cop:3.2,fanPower:1400},
  };
  const previous=oldDefaults[migrated.tier];
  if(previous&&Object.entries(previous).every(([key,value])=>Number(migrated[key])===value)){
    const current=COOLING_UNIT_MODELS[migrated.tier];
    for(const key of Object.keys(previous))migrated[key]=current[key];
  }
  migrated.coolingBalanceRevision=COOLING_UNIT_BALANCE_REVISION;
  return migrated;
}
