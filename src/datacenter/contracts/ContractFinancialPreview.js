export function computeFinancialPreview(offer,plan,{energyTariff=.55,coolingReserveKW=0}={}){
  const dailyProfile={business:.52,streaming:.58,ai:.68,storage:.3,constant:.5},factor=dailyProfile[offer?.loadProfile]??.5;
  const rackIndex=new Map();
  for(const rack of offer?.world?.entitiesByType?.('computeRack')||[])rackIndex.set(rack.assetId,rack);
  let incrementalPowerW=0;
  for(const allocation of plan?.allocations||[]){const rack=rackIndex.get(allocation.assetId);if(!rack)continue;const capacity=rack.capacity||{};
    const share=rack.specialization==='cpu'?Math.max((allocation.vcpu||0)/(capacity.vcpu||1),(allocation.ramGB||0)/(capacity.ramGB||1)):rack.specialization==='gpu'?(allocation.gpuDevices?.length||0)/(capacity.gpuCount||1):(allocation.storageTB||0)/(capacity.storageTB||1);
    incrementalPowerW+=(rack.maxPowerW-rack.idlePowerW)*Math.min(1,share)*factor;
  }
  const monthlyEnergyCost=incrementalPowerW/1000*24*30*energyTariff,monthlyRevenue=Number(offer?.monthlyFee)||0;
  return {monthlyRevenue,incrementalPowerKW:incrementalPowerW/1000,monthlyEnergyCost,estimatedMargin:monthlyRevenue-monthlyEnergyCost,
    thermalRiskKW:Math.max(0,incrementalPowerW*.98/1000-coolingReserveKW),capacityReady:Boolean(plan?.ok),estimated:true};
}
