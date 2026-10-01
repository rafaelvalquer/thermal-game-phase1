const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const terminal=new Set(['completed','cancelled']);

function resourceSnapshot(contract){
  return {
    modality:contract.modality||'colocation',productId:contract.productId||null,productName:contract.productName||contract.tier||'Contrato',
    rackCount:finite(contract.rackCount),powerPerRackKW:finite(contract.powerPerRackKW),
    computeRequirements:contract.computeRequirements?{...contract.computeRequirements}:null,
    allocations:(contract.allocations||[]).map(item=>({assetId:item.assetId,vcpu:finite(item.vcpu),ramGB:finite(item.ramGB),gpuDevices:(item.gpuDevices||[]).map(gpu=>({slot:gpu.slot,vramGB:finite(gpu.vramGB)})),storageTB:finite(item.storageTB)})),
  };
}

export class ContractHistorySystem {
  constructor(state){
    this.state=state;
    if((Number(state.commercialHistoryRevision)||0)<1){
      state.commercialHistoryRevision=1;state.commercialDailyHistory=Array.isArray(state.commercialDailyHistory)?state.commercialDailyHistory:[];
      state.commercialEvents=Array.isArray(state.commercialEvents)?state.commercialEvents:[];
      state.commercialHistoryPartial=true;
    }
    state.commercialDailyHistory??=[];state.commercialEvents??=[];
    state.commercialHistoryPartial??=false;state.commercialEventSequence??=0;
  }
  ensureContract(contract){
    if(!contract)return null;
    contract.totalRecurringRevenue=finite(contract.totalRecurringRevenue);
    contract.totalSetupRevenue=finite(contract.totalSetupRevenue);
    contract.totalPenalties=finite(contract.totalPenalties);
    contract.lastBilledDay=Number.isFinite(contract.lastBilledDay)?contract.lastBilledDay:null;
    contract.commercialResourceSnapshot??=resourceSnapshot(contract);
    return contract;
  }
  recordEvent(type,contract,day=this.state.day,details={}){
    if(!contract?.id)return null;
    this.ensureContract(contract);
    const dedupeKey=details.dedupeKey||`${type}:${contract.id}:${day}:${details.sequence??''}`;
    if(this.state.commercialEvents.some(event=>event.dedupeKey===dedupeKey))return null;
    const snapshot=resourceSnapshot(contract);
    const event={id:++this.state.commercialEventSequence,dedupeKey,type,contractId:contract.id,clientName:contract.clientName||'Cliente',
      productId:contract.productId||null,productName:contract.productName||contract.tier||'Contrato',modality:contract.modality||'colocation',
      day:Number(day)||0,monthlyFee:finite(contract.monthlyFee),installationFee:finite(contract.installationFee),
      termDays:finite(contract.termDays),maxInletTemperature:finite(contract.maxInletTemperature),availability:finite(contract.availability),
      cancelReason:contract.cancelReason||null,resources:snapshot,...details};
    this.state.commercialEvents.push(event);
    const daily=this.daily(Number(day)||0);
    if(type==='signed'||type==='renewal-signed')daily.signedContracts++;
    if(type==='completed')daily.completedContracts++;
    if(type==='cancelled')daily.cancelledContracts++;
    return event;
  }
  recordSetup(contract,amount,day=this.state.day){
    const value=finite(amount);if(!contract||value<=0)return 0;
    this.ensureContract(contract);contract.totalSetupRevenue+=value;
    const daily=this.daily(day);daily.setupRevenue+=value;daily.setupByModality[contract.modality||'colocation']+=value;
    this.recordEvent('setup-revenue',contract,day,{amount:value,dedupeKey:`setup:${contract.id}:${day}`});return value;
  }
  recordBilling(contract,day,amount){
    if(!contract||!Number.isFinite(day)||day<0)return 0;
    this.ensureContract(contract);if(contract.lastBilledDay===day)return 0;
    const value=Math.max(0,finite(amount));contract.lastBilledDay=day;contract.totalRecurringRevenue+=value;
    const daily=this.daily(day);daily.recurringRevenue+=value;daily.revenueByModality[contract.modality||'colocation']+=value;return value;
  }
  recordPenalty(contract,day,amount,reason='SLA'){
    const value=Math.max(0,finite(amount));if(!contract||!value)return 0;
    this.ensureContract(contract);contract.totalPenalties+=value;
    const daily=this.daily(day);daily.penalties+=value;daily.penaltiesByModality[contract.modality||'colocation']+=value;
    this.recordEvent('penalty',contract,day,{amount:value,reason,dedupeKey:`penalty:${contract.id}:${day}:${reason}`});return value;
  }
  daily(day){
    let item=this.state.commercialDailyHistory.find(entry=>entry.day===day);
    if(!item){item={day,recurringRevenue:0,setupRevenue:0,penalties:0,energyCost:0,fixedCosts:0,otherExpenses:0,net:0,
      revenueByModality:{compute:0,colocation:0},setupByModality:{compute:0,colocation:0},penaltiesByModality:{compute:0,colocation:0},
      activeContracts:0,installingContracts:0,signedContracts:0,completedContracts:0,cancelledContracts:0,violatedContracts:0};this.state.commercialDailyHistory.push(item);}
    item.revenueByModality??={compute:0,colocation:0};item.setupByModality??={compute:0,colocation:0};item.penaltiesByModality??={compute:0,colocation:0};
    for(const key of ['recurringRevenue','setupRevenue','penalties','energyCost','fixedCosts','otherExpenses','net','activeContracts','installingContracts','signedContracts','completedContracts','cancelledContracts','violatedContracts'])item[key]=finite(item[key]);
    for(const group of ['revenueByModality','setupByModality','penaltiesByModality'])for(const key of ['compute','colocation'])item[group][key]=finite(item[group][key]);
    return item;
  }
  finalizeDay(day,{energyCost=0,fixedCosts=0,otherExpenses=0,net=0,contracts=[]}={}){
    const item=this.daily(day);item.energyCost=finite(energyCost);item.fixedCosts=finite(fixedCosts);item.otherExpenses=finite(otherExpenses);
    item.net=item.recurringRevenue+item.setupRevenue-item.energyCost-item.fixedCosts-item.otherExpenses-item.penalties;
    item.activeContracts=contracts.filter(contract=>contract.status==='active').length;
    item.installingContracts=contracts.filter(contract=>contract.status==='installing').length;
    item.violatedContracts=contracts.filter(contract=>contract.lastSlaViolationDay===day||contract.dailyViolation).length;
    return item;
  }
  recordStatusTransitions(previousStatuses,contracts,day){
    for(const contract of contracts){
      this.ensureContract(contract);const previous=previousStatuses.get(contract.id);
      if(previous===contract.status)continue;
      if(contract.status==='active'&&['installing',undefined].includes(previous))this.recordEvent('operational-start',contract,day,{dedupeKey:`operational:${contract.id}:${day}`});
      else if(contract.status==='completed'){
        contract.commercialEndedDay=contract.completedDay??day;contract.commercialEndReason='Prazo contratual concluído';
        this.recordEvent('completed',contract,contract.commercialEndedDay,{dedupeKey:`completed:${contract.id}:${contract.commercialEndedDay}`});
      }else if(contract.status==='cancelled'){
        contract.commercialEndedDay=contract.cancelledDay??day;contract.commercialEndReason=contract.cancelReason||'Cancelado';
        this.recordEvent('cancelled',contract,contract.commercialEndedDay,{dedupeKey:`cancelled:${contract.id}:${contract.commercialEndedDay}`});
      }
    }
  }
}

export function contractResourceSnapshot(contract){return resourceSnapshot(contract);}
export function isTerminalContract(contract){return terminal.has(contract?.status);}
