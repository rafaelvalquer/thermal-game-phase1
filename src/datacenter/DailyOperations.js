export function createDailyOperations(partial=false){
  return {seconds:0,facilityEnergyJ:0,rackEnergyJ:0,peakPowerKW:0,maxAirTemperature:null,partial};
}

export function normalizeDailyState(state,savedState){
  const day=Math.floor((state.clockSeconds||0)/86400)+1;
  state.day=day;
  state.pauseOnNewContracts??=true;
  state.lastSettledDay??=day-1;
  state.dailyOperations??=createDailyOperations(Boolean(savedState));
  state.powerEnergyTotal??=state.lastPowerEnergy||0;
  state.reportPending??=false;
  state.notificationPending??=false;
}

export function sampleDailyOperations(operations,metrics,rackPowerKW,seconds){
  operations.seconds+=seconds;
  operations.facilityEnergyJ+=(metrics.powerDraw||0)*seconds;
  operations.rackEnergyJ+=rackPowerKW*1000*seconds;
  operations.peakPowerKW=Math.max(operations.peakPowerKW,(metrics.powerDraw||0)/1000);
  if(Number.isFinite(metrics.maxAirTemp))operations.maxAirTemperature=Math.max(operations.maxAirTemperature??-Infinity,metrics.maxAirTemp);
}

export function summarizeDailyOperations(operations){
  return {averagePowerKW:operations.seconds?operations.facilityEnergyJ/operations.seconds/1000:null,
    peakPowerKW:operations.seconds?operations.peakPowerKW:null,maxAirTemperature:operations.maxAirTemperature,
    pue:operations.rackEnergyJ>0?operations.facilityEnergyJ/operations.rackEnergyJ:null,
    partial:operations.partial||operations.seconds<86400,observedSeconds:operations.seconds};
}
