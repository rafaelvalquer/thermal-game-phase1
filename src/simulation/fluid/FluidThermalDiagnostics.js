import { WATER_CP } from '../../utils/Constants.js';
import { MIN_FLOW } from './HydraulicSolver.js';

export function fluidThermalDiagnosis(entity){
  if(!entity)return '';
  if(entity.networkStatus!=='CLOSED'||!entity.circuitClosed)return `Circuito indisponível: ${entity.networkStatus||'sem circulação'}.`;
  if(entity.enabled===false)return 'Equipamento desligado; não transfere calor.';
  if(entity.flowRate<=MIN_FLOW)return 'Sem vazão de água; confira bomba e circuito.';
  const inlet=Number(entity.inletTemperature??entity.waterTemperature??25),outlet=Number(entity.outletTemperature??inlet),delta=outlet-inlet;
  if(entity.type==='exchanger'){
    if(entity.captureMode==='DIRECT_RACK'){
      if(entity.thermalPower>=Number(entity.ratedCapacity||30000)*.98)return 'Trocador no limite nominal; acrescente outro trocador para maior carga.';
      if(entity.flowRate<.35)return 'Vazão baixa no trocador; use modo Normal ou Boost na bomba.';
      return 'Captura direta do rack. Temperaturas de entrada, saída e carga mostram a troca real.';
    }
    if(entity.captureMode==='AIR_COIL')return 'Serpentina captando ar próximo; posicionamento mais perto do rack melhora a troca.';
    return 'Sem fonte quente alcançada pelo trocador.';
  }
  if(entity.type==='waterChiller'){
    if(inlet<=(entity.targetTemperature??15)+.1)return `Água já está no alvo de ${Number(entity.targetTemperature||15).toFixed(1)} °C.`;
    if(entity.power<=0)return 'Sem potência elétrica disponível para o compressor.';
    if(entity.flowRate<.35)return 'Vazão baixa no chiller; a capacidade de 80 kW depende do fluxo de água.';
    return 'Resfriando água; o calor removido e o consumo elétrico retornam ao ar do local.';
  }
  if(entity.type==='radiator'){
    if(entity.waterTemperature<=Number(entity.airInTemperature??25)+(entity.minimumApproach??2.5))return 'Água não está quente o bastante para rejeitar calor com a aproximação mínima.';
    if(entity.flowRate<.35)return 'Vazão baixa no radiador; aumente o modo da bomba ou reduza a resistência.';
    if(Math.abs(entity.thermalPower)>0&&Math.abs(entity.thermalPower)/(entity.flowRate*WATER_CP)<.5)return 'Vazão alta para a carga térmica atual; a queda de temperatura da água é pequena.';
    return entity.thermalPower>0?'Radiador rejeitando calor.':'Sem rejeição térmica neste intervalo.';
  }
  return `Queda de ${Math.abs(delta).toFixed(2)} °C na passagem.`;
}
