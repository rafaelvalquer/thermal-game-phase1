const n=value=>Number.isFinite(Number(value))?Number(value):0;
export function selectCommercialStats(manager,period='all'){
  const {state}=manager,contracts=state.contracts||[],active=contracts.filter(item=>item.status==='active'),installing=contracts.filter(item=>item.status==='installing');
  const days=period==='7'?7:period==='30'?30:Infinity,latest=state.commercialDailyHistory||[],lastDay=latest.at(-1)?.day??manager.clock.day-1;
  const history=latest.filter(item=>lastDay-item.day<days),cloud=active.filter(item=>item.modality==='compute'),colocation=active.filter(item=>item.modality!=='compute');
  const sum=(items,key)=>items.reduce((total,item)=>total+n(item[key]),0);
  const compute=manager.computeCapacitySummary||{cpu:{},ram:{},gpu:{},storage:{}};
  const occupancy=item=>({reserved:n(item.reserved),total:n(item.total),percent:item.total?100*n(item.reserved)/item.total:0});
  return {period,daysAvailable:latest.length,history,monthlyRecurring:sum(active,'monthlyFee'),cloudMonthly:sum(cloud,'monthlyFee'),colocationMonthly:sum(colocation,'monthlyFee'),
    realizedRecurringRevenue:sum(history,'recurringRevenue'),setupRevenue:sum(history,'setupRevenue'),realizedRevenue:sum(history,'recurringRevenue')+sum(history,'setupRevenue'),penalties:sum(history,'penalties'),energyCost:sum(history,'energyCost'),fixedCosts:sum(history,'fixedCosts'),otherExpenses:sum(history,'otherExpenses'),net:sum(history,'net'),
    activeCount:active.length,installingCount:installing.length,completedCount:contracts.filter(item=>item.status==='completed').length,cancelledCount:contracts.filter(item=>item.status==='cancelled').length,
    violatedCount:contracts.filter(item=>item.lastSlaViolationDay!=null||item.dailyViolation).length,byProduct:contracts.reduce((map,item)=>{const key=item.productName||item.tier||'Outro';map[key]=(map[key]||0)+(item.status==='active'||item.status==='installing'?1:0);return map;},{}),
    cpu:occupancy(compute.cpu||{}),ram:occupancy(compute.ram||{}),gpu:occupancy(compute.gpu||{}),storage:occupancy(compute.storage||{}),powerCommitted:n(manager.committedPowerKW),powerCapacity:n(manager.powerGrid?.capacityKW),thermalCommitted:n(manager.committedCoolingKW),thermalCapacity:n(manager.effectiveCoolingCapacityKW),
    partial:Boolean(state.commercialHistoryPartial),revenueByDay:history.map(item=>({day:item.day,cloud:n(item.revenueByModality?.compute),colocation:n(item.revenueByModality?.colocation)})),contractsByDay:history.map(item=>({day:item.day,active:n(item.activeContracts),signed:n(item.signedContracts)}))};
}

export function classifyContract(contract,manager){
  if(contract.status==='installing')return {key:'installing',label:'EM INSTALAÇÃO'};
  const unprovisioned=contract.modality==='compute'&&(!(contract.allocations||[]).length||contract.computeDiagnostics?.some(message=>/sem recursos provisionados|equipamento reservado ausente|insuficiente|faltam/i.test(message)));
  const violated=contract.dailyViolation||contract.lastSlaViolationDay===manager.clock.day;
  if(unprovisioned)return {key:'violated',label:'SEM PROVISIONAMENTO'};
  if(violated)return {key:'violated',label:'SLA VIOLADO'};
  const racks=contract.modality==='compute'
    ?(contract.allocations||[]).map(allocation=>manager.world.entitiesByType('computeRack').find(rack=>rack.assetId===allocation.assetId)).filter(Boolean)
    :manager.world.entitiesByType('serverRack').filter(rack=>rack.contractId===contract.id);
  const hot=racks.some(rack=>Number(rack.inletTemperature)>=Number(contract.maxInletTemperature)-2);
  const availability=contract.activeSeconds?100*(contract.uptimeSeconds||0)/contract.activeSeconds:100;
  if(hot||availability<Number(contract.availability||0)+.25)return {key:'attention',label:'ATENÇÃO'};
  return {key:'active',label:'ATIVO'};
}
