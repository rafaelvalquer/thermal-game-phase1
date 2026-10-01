import { formatEnergy, formatPower } from '../utils/MathUtils.js';
import { entityLabel, thermalState } from '../rendering/VisualTheme.js';
import { SPRITES, spriteIdFor, spriteIconStyle } from '../rendering/sprites/SpriteManifest.js';
import { CoolingAirExchange } from '../simulation/cooling/CoolingAirExchange.js';
import { SOLAR_PANEL_PEAK_POWER_W } from '../entities/SolarPanel.js';
import { fluidThermalDiagnosis } from '../simulation/fluid/FluidThermalDiagnostics.js';
import { COMPUTE_LOAD_PROFILE_LABELS } from '../datacenter/compute/ComputeLoadProfiles.js';

const fluidTypes=['pipe','pump','tank','radiator','exchanger','waterChiller'];
const airDuctTypes=['duct'];
const POWER_DEVICE_TYPES=new Set(['fan','exhaust','pump','radiator','waterChiller','coolingUnit','serverRack','computeRack','battery','solarPanel']);
const dirGlyph=d=>d?.x>0?'→':d?.x<0?'←':d?.y>0?'↓':d?.y<0?'↑':'—';

function rackCoolingAdvice(world,rack){
  if(!world.thermalSystems?.simpleCooling||rack.status==='CANCELLED'||!(rack.heatGenerationPower>0))return null;
  const cooling=world.coolingSystem,units=world.entitiesByType('coolingUnit');
  if(!units.length)return 'Instale uma condensadora para retirar o calor dos racks.';
  const paths=(cooling?.networks||[]).filter(network=>network.status==='READY').flatMap(network=>network.paths||[]).filter(path=>path.flowRate>.05);
  if(!paths.length)return 'A condensadora não está entregando ar: confira dutos, grelhas e energia.';
  const rackHeat=[...world.entitiesByType('serverRack'),...world.entitiesByType('computeRack')].filter(item=>item.status!=='CANCELLED').reduce((sum,item)=>sum+(item.heatGenerationPower||0),0);
  const available=cooling.metrics?.coolingAvailableCapacity??units.reduce((sum,unit)=>sum+(unit.availableCapacity||0),0);
  if(rackHeat>available+1)return 'Capacidade de refrigeração abaixo do calor gerado pelos racks.';
  const intake=rack.airIntakeDirection||{x:0,y:-1},x=rack.x+intake.x,y=rack.y+intake.y;
  if(!world.inBounds(x,y)||!world.isAir(x,y))return 'Entrada de ar bloqueada; deixe livre a face fria do rack.';
  const target=world.index(x,y),exchange=cooling.exchange||new CoolingAirExchange(world,null);
  const reaches=paths.some(path=>exchange.supplyCells(path.vent,3,false).some(cell=>world.index(cell.x,cell.y)===target));
  if(!reaches)return 'O ar frio não alcança a entrada: reposicione a grelha ou ajuste sua direção.';
  const exhaust=rack.airExhaustDirection||{x:0,y:1},hotX=rack.x+exhaust.x,hotY=rack.y+exhaust.y;
  if(!world.inBounds(hotX,hotY)||!world.isAir(hotX,hotY))return 'Saída quente bloqueada; libere a face de exaustão do rack.';
  const velocity=-(world.airX[target]*intake.x+world.airY[target]*intake.y);
  if(velocity<.01)return velocity<-.01?'O ar está se afastando da face fria; ajuste a direção do fluxo.':'Vazão baixa na entrada do rack; confira ramificações e fluxo da grelha.';
  return 'Ar frio e vazão chegam à entrada; mantenha livre a saída de ar quente.';
}

export class Inspector {
  constructor(root){this.root=root;this.target=null;this.onPowerToggle=()=>{};}
  setTarget(target){this.target=target;}

  update(world){
    const t=this.target;
    if(!t){
      const simple=world.thermalSystems?.simpleCooling;
      this.root.innerHTML='<div class="inspector-empty"><span>⌖</span><strong>Nenhuma seleção</strong><p>'+(simple?'Clique em um equipamento para ver temperatura, refrigeração e estado.':'Clique no mapa para ver temperatura, pressão, energia, fluxo e estado operacional.')+'</p></div>';
      return;
    }
    if(t.kind==='entity'&&(world.getEntityById?.(t.entity.id)||world.entities?.find(entity=>entity.id===t.entity.id))!==t.entity){this.target=null;return this.update(world);}
    if(t.kind==='entity')return this.entity(world,t.entity);
    return this.tile(world,t.x,t.y);
  }

  entity(world,e){
    let temperature=null,rows=[['Posição',e.x+', '+e.y]];

    if(e.type==='technician'){
      const rack=world.getEntityById?.(e.targetRackId)||world.entities?.find(entity=>entity.id===e.targetRackId),action=e.action||'patrolling';
      const labels={patrolling:'EM PATRULHA',moving:'A CAMINHO',working:'EM ATENDIMENTO',cooldown:'EM INTERVALO'};
      rows.push(['Estado',labels[action]||'EM PATRULHA'],['Ação',action==='working'?'Inspecionando e otimizando troca térmica':action==='moving'?'Deslocando-se até a tarefa':action==='cooldown'?'Aguardando próximo atendimento':'Percorrendo a área acessível']);
      if(rack){rows.push(['Rack-alvo',rack.name||'Rack'],['Destino',e.goalX!=null?e.goalX+', '+e.goalY:rack.x+', '+rack.y]);if(action==='working')rows.push(['Melhoria','Troca térmica +20%'],['Progresso',(Math.max(0,Math.min(1,e.workProgress||0))*100).toFixed(0)+'%'],['Tempo restante',Math.max(0,e.boostRemaining||0).toFixed(1)+' s']);}
      if(action==='cooldown')rows.push(['Próximo atendimento',Math.max(0,e.cooldownRemaining||0).toFixed(1)+' s']);
      if(action==='moving')rows.push(['Etapas restantes',String(Math.max(0,(e.path?.length||0)-(e.pathIndex||0)))]);
      const facing=e.facing||{x:0,y:1};rows.push(['Orientação',facing.x>0?'Leste':facing.x<0?'Oeste':facing.y>0?'Sul':'Norte']);
    }

    if(e.isHeatMachine){
      temperature=e.temperature;
      rows.push(
        ['Temperatura',e.temperature.toFixed(2)+' °C'],
        ['Geração',formatPower(e.heatGenerationPower||0)],
        ['Resfriamento',formatPower(e.coolingPower)],
        ['Balanço',formatPower(e.thermalBalance||0)],
        ['Operação',e.started?'Ligada':'Aguardando']
      );
    if(e.type==='serverRack')rows.push(['Cliente',e.clientId||'Independente'],['Potência',formatPower((e.currentPowerKW||0)*1000)+' / '+formatPower((e.maxPowerKW||0)*1000)],['Carga',(Number(e.cpuLoad||0)*100).toFixed(0)+'%'],['Temperatura na face fria',Number(e.intakeAirTemperature??e.inletTemperature??e.temperature).toFixed(1)+' °C'],['Temperatura na face quente',Number(e.exhaustAirTemperature??e.exhaustTemperature??e.temperature).toFixed(1)+' °C'],['Vazão na entrada',Number(e.intakeAirFlow||0).toFixed(2)+' m³/s'],['Velocidade na entrada',Number(e.intakeAirVelocity||0).toFixed(2)+' m/s'],['Vazão na saída',Number(e.exhaustAirFlow||0).toFixed(2)+' m³/s'],['Velocidade na saída',Number(e.exhaustAirVelocity||0).toFixed(2)+' m/s'],['Estado',e.powerBlocked?'SEM ENERGIA':e.status||'NORMAL'],['SLA',Number(e.slaTemperature||30).toFixed(1)+' °C máx.'],['Disponibilidade',Number(e.uptime??100).toFixed(2)+'%'],['Sentido de insuflação',dirGlyph(e.airIntakeDirection)],['Sentido de retorno',dirGlyph(e.airExhaustDirection)],...([rackCoolingAdvice(world,e)].filter(Boolean).map(advice=>['Diagnóstico',advice])));

    if(e.type==='computeRack'){
      const model=({basic:'Básico',professional:'Profissional',enterprise:'Enterprise'})[e.modelId]||e.modelId;
      const capacity=e.specialization==='cpu'?e.capacity.vcpu+' vCPU · '+e.capacity.ramGB+' GB RAM · '+e.capacity.frequencyGHz+' GHz':e.specialization==='gpu'?e.capacity.gpuCount+' GPUs · '+e.capacity.vramPerGpuGB+' GB/GPU · '+e.capacity.vramGB+' GB VRAM':' '+e.capacity.storageTB+' TB úteis';
      const dc=world.datacenter,reserved=dc?.computeCapacity?.reservationsByRack?.().get(e.assetId)||{vcpu:0,ramGB:0,gpuDevices:[],storageTB:0,contracts:[]};
      const reservation=e.specialization==='cpu'?reserved.vcpu+' vCPU · '+reserved.ramGB+' GB RAM':e.specialization==='gpu'?reserved.gpuDevices.length+' / '+e.capacity.gpuCount+' GPUs reservadas':reserved.storageTB+' / '+e.capacity.storageTB+' TB';
      const clients=[...new Set((reserved.contracts||[]).map(id=>dc?.state.contracts.find(contract=>contract.id===id)?.clientName).filter(Boolean))];
      const free=e.specialization==='cpu'?Math.max(0,e.capacity.vcpu-reserved.vcpu)+' vCPU · '+Math.max(0,e.capacity.ramGB-reserved.ramGB)+' GB RAM':e.specialization==='gpu'?Math.max(0,e.capacity.gpuCount-reserved.gpuDevices.length)+' GPU(s)':Math.max(0,e.capacity.storageTB-reserved.storageTB)+' TB';
      const loadProfiles=e.computeLoadProfiles||[],profileLabels=[...new Set(loadProfiles.map(item=>COMPUTE_LOAD_PROFILE_LABELS[item.profile]||item.profile))],upcoming=loadProfiles.map(item=>item.nextPeak).filter(Boolean).sort((a,b)=>a.day-b.day||a.hour-b.hour)[0];
      const nextPeak=upcoming?`${String(Math.floor(upcoming.hour)).padStart(2,'0')}h · dia ${upcoming.day}`:loadProfiles.length?'Sem pico definido':'Sem contrato ativo';
      rows.push(['Patrimônio',e.assetId],['Especialização',({cpu:'CPU',gpu:'GPU',storage:'Storage'})[e.specialization]||e.specialization],['Modelo',model],['Capacidade instalada',capacity],['Capacidade reservada',reservation],['Capacidade disponível',free],['Clientes provisionados',clients.join(', ')||'Nenhum'],['Utilização',(Number(e.utilization||0)*100).toFixed(1)+'%'],['Potência',formatPower(e.currentPowerW||0)+' / '+formatPower(e.maxPowerW||0)],['Potência em repouso',formatPower(e.idlePowerW||0)],['Temperatura na face fria',Number(e.intakeAirTemperature??e.inletTemperature??e.temperature).toFixed(1)+' °C'],['Temperatura na face quente',Number(e.exhaustAirTemperature??e.exhaustTemperature??e.temperature).toFixed(1)+' °C'],['Vazão na entrada',Number(e.intakeAirFlow||0).toFixed(2)+' m³/s'],['Vazão na saída',Number(e.exhaustAirFlow||0).toFixed(2)+' m³/s'],['Estado',e.powerBlocked?'SEM ENERGIA':e.enabled?e.utilization>0?'EM OPERAÇÃO':'EM ESPERA':'DESLIGADO'],['SLA térmico',Number(e.slaTemperature||30).toFixed(1)+' °C máx.'],['Sentido de insuflação',dirGlyph(e.airIntakeDirection)],['Sentido de retorno',dirGlyph(e.airExhaustDirection)],...([rackCoolingAdvice(world,e)].filter(Boolean).map(advice=>['Diagnóstico',advice])));
      rows.push(['Perfil de carga',profileLabels.join(', ')||'Sem contrato ativo'],['Carga atual',(Number(e.utilization||0)*100).toFixed(0)+'%'],['Próximo pico',nextPeak]);
    }
    }

    if(fluidTypes.includes(e.type)){
      temperature=e.waterTemperature;
      rows.push(
        ['Rede',e.networkId||'—'],
        ['Circuito',e.networkStatus||'DISCONNECTED'],
        ['Água',e.waterTemperature.toFixed(2)+' °C'],
        ['Entrada',Number(e.inletTemperature??e.waterTemperature).toFixed(2)+' °C'],
        ['Saída',Number(e.outletTemperature??e.waterTemperature).toFixed(2)+' °C'],
        ['ΔT',(Number(e.outletTemperature??e.waterTemperature)-Number(e.inletTemperature??e.waterTemperature)).toFixed(2)+' °C'],
        ['Vazão',Number(e.flowRate||0).toFixed(2)+' kg/s'],
        ['Sentido',dirGlyph(e.flowVector)],
        ['Resistência',String(e.resistance||0)]
      );
      if(e.type==='pump')rows.push(['Saída da bomba',dirGlyph(e.direction)],['Modo',({eco:'ECO',normal:'NORMAL',boost:'BOOST'})[e.flowMode]||'NORMAL'],['Limite de vazão',Number(e.flowMode==='boost'?e.maxFlowRateBoost:e.flowMode==='eco'?Math.min(1,(e.maxFlowRate||1.5)*.67):e.maxFlowRate||1.5).toFixed(2)+' kg/s'],['Drive hidráulico',String(e.hydraulicPower)]);
      if(e.type==='exchanger'){
        const machine=world.getEntityById?.(e.machineId)||world.entities?.find(entity=>entity.id===e.machineId);
        rows.push(['Modo de captura',({DIRECT_RACK:'Rack direto',AIR_COIL:'Serpentina de ar',IDLE:'Em espera'})[e.captureMode]||'Em espera'],['Máquina',machine?.name||'—'],['Capacidade nominal',formatPower(e.ratedCapacity||30000)],['Calor do rack capturado',formatPower(e.directCoolingPower||0)],['Ar captado',formatPower(e.airCoolingPower||0)],['Calor para água',formatPower(e.thermalPower||0)],['Diagnóstico',fluidThermalDiagnosis(e)]);
        if(e.circuitClosed&&!world.entities.some(item=>item.type==='radiator'&&item.networkId===e.networkId))rows.push(['Diagnóstico','A água precisa de um radiador neste circuito para rejeitar o calor.']);
        else if(e.circuitClosed&&e.airCoolingPower===0&&world.isAir(e.x,e.y)&&e.waterTemperature>=world.temperatureAt(e.x,e.y))rows.push(['Diagnóstico','Água igual ou mais quente que o ar local; resfrie-a no radiador para captar calor.']);
      }
      if(e.type==='tank')rows.push(['Água armazenada',Number(e.waterMass||0).toFixed(0)+' kg'],['Energia armazenada',formatEnergy(e.energy||0)],['Variação térmica',formatPower(e.thermalPower||0)],['Diagnóstico',e.flowRate<.01?'Sem circulação; a massa de água funciona apenas como reserva térmica.':'A água amortece variações de temperatura do circuito.']);
      if(e.type==='radiator')rows.push(
        ['Calor rejeitado',formatPower(e.thermalPower||0)],
        ['Ar entrada',Number(e.airInTemperature??25).toFixed(2)+' °C'],
        ['Ar saída',Number(e.airOutTemperature??25).toFixed(2)+' °C'],
        ['Descarga',dirGlyph(e.direction)],
        ['Capacidade nominal',formatPower(e.ratedCapacity||40000)],['Ventilador',e.enabled===false?'Desligado':formatPower(e.power||600)],['Vazão do ventilador',Number(e.fanAirflow||2.5).toFixed(1)+' m³/s'],['Local',e.outdoor?'Exterior':'Interior'],['Calor ao exterior',e.rejectedToExterior?'Sim':'Não'],['Diagnóstico',fluidThermalDiagnosis(e)],['Fan boost',Number(e.fanBoost||1).toFixed(2)+'×']
      );
      if(e.type==='waterChiller')rows.push(['Alvo da água',Number(e.targetTemperature||15).toFixed(1)+' °C'],['Capacidade nominal',formatPower(e.ratedCapacity||80000)],['Calor retirado da água',formatPower(e.coolingPower||0)],['COP',Number(e.cop||4).toFixed(1)],['Potência elétrica',formatPower(e.power||0)],['Calor rejeitado ao ar',formatPower(e.rejectedHeatPower||0)],['Diagnóstico',fluidThermalDiagnosis(e)]);
    }

    if(e.type==='sensor'){
      temperature=e.current;
      rows.push(['Atual',e.current.toFixed(2)+' °C'],['Média',e.average.toFixed(2)+' °C'],['Máxima',e.max.toFixed(2)+' °C']);
    }

    if(e.type==='battery'){
      const stateLabel={CHARGING:'Carregando',DISCHARGING:'Descarregando',FULL:'Cheia',EMPTY:'Vazia',OFF:'Desligada',IDLE:'Em espera'}[e.operationState]||'Em espera';
      rows.push(['Estado operacional',stateLabel],['Energia armazenada',Number(e.storedEnergyKWh||0).toFixed(2)+' / 50.00 kWh'],['Carga',(Number(e.chargePercent)||0).toFixed(1)+'%'],['Potência de carga',formatPower(e.chargePowerW||0)],['Potência de descarga',formatPower(e.dischargePowerW||0)],['Limite por sentido','10.00 kW'],['Eficiência do ciclo','90%']);
    }

    if(e.type==='solarPanel')rows.push(['Geração atual',formatPower(e.generationW||0)],['Potência de pico',formatPower(e.peakPowerW||SOLAR_PANEL_PEAK_POWER_W)],['Período de geração','06h–18h · pico às 12h']);

    if(e.type==='fan'||e.type==='exhaust'){
      rows.push(['Direção',dirGlyph(e.direction)],['Vazão atual',Number(e.currentFlow||0).toFixed(2)+' m³/s']);
      if(world.thermalSystems?.simpleCooling){
        rows.push(['Fluxo entregue',(Number(e.flowEfficiency||0)*100).toFixed(0)+'%']);
        if(e.type==='exhaust')rows.push(['Saída',e.status],['Calor removido',formatPower(e.heatRejectedPower||0)]);
      }else{
        rows.push(['Free Flow',Number(e.qFree||0).toFixed(2)+' m³/s'],['Eficiência fluxo',(Number(e.flowEfficiency||0)*100).toFixed(0)+'%'],['Restrição',e.flowCondition||'BLOCKED'],
          ['Pressão',Number(e.currentPressureRise||0).toFixed(1)+' Pa'],['Velocidade',Number(e.currentVelocity||0).toFixed(2)+' m/s'],
          ['Operating Point',(Number(e.operatingPoint||0)*100).toFixed(0)+'%'],['Eficiência',(Number(e.efficiency||0)*100).toFixed(0)+'%']);
        if(e.type==='exhaust')rows.push(['Saída',e.status],['Calor rejeitado',formatPower(e.heatRejectedPower||0)]);
      }
      if(e.type==='exhaust')rows.push(['Diagnóstico',e.status==='BLOCKED'?'Sucção bloqueada ou sem vazão; libere a área de captura.':e.status==='HIGH RESISTANCE'?'Duto virtual ao exterior ativo; a captura está com vazão reduzida.':e.enabled===false?'Desligado; não está sugando nem removendo calor.':'Duto virtual ao exterior ativo; a sucção captura o ar pelo lado oposto à saída.']);
    }

    if(airDuctTypes.includes(e.type)&&world.thermalSystems?.simpleCooling)rows.push(
      ['Rede',e.networkId||'—'],['Estado',e.networkStatus||'DISCONNECTED'],['Comprimento',String((world.coolingSystem?.networks||[]).find(n=>n.id===e.networkId)?.totalLength||0)+' tiles'],['Temperatura',Number(e.airTemperature||25).toFixed(1)+' °C'],['Vazão',Number(e.flowRate||0).toFixed(2)+' m³/s'],['Instalação',e.embedded?'Embutido':'Exposto']);

    if(e.type==='coolingUnit'){
      const network=(world.coolingSystem?.networks||[]).find(item=>item.sourceUnits.includes(e));
      rows.push(['Modelo',({compact:'Compacta',commercial:'Comercial',industrial:'Industrial'})[e.tier]||'Comercial'],['Estado',e.status],['Rede',e.networkId||'—'],['Condensadoras',String(network?.sourceUnits.length||0)],['Saídas',String(network?.vents.length||0)],
        ['Capacidade nominal',formatPower(e.ratedCoolingCapacity)],['Capacidade disponível',formatPower(e.availableCapacity||0)],['COP',Number(e.cop||0).toFixed(1)+' · '+formatPower((e.availableCapacity||0)/Math.max(.1,e.cop))+' elétricos a plena carga'],
        ['Carga',(Math.min(100,Math.round((e.loadRatio||0)*100)))+'%'],['Vazão',Number(e.currentAirFlow||0).toFixed(2)+' / '+e.maxAirFlow+' m³/s'],
        ['Retorno',Number(e.returnTemperature||25).toFixed(1)+' °C'],['Insuflação',Number(e.supplyTemperature||25).toFixed(1)+' °C'],
        ['Frio removido da sala',formatPower(e.actualRoomCooling||0)],['Refrigeração da unidade',formatPower(e.currentCooling||0)+' / '+formatPower(e.availableCapacity||0)],
        ['Potência elétrica',formatPower(e.electricalPower||0)],['Calor rejeitado',formatPower(e.heatRejected||0)],['Local',e.indoor?'Interno':'Externo']);
    }
    if(e.type==='supplyVent'){
      const served=world.inBounds&&world.isAir&&world.index?(world.coolingSystem?.exchange||new CoolingAirExchange(world,null)).serviceRacks(e):[];
      rows.push(
      ['Rede',e.networkId||'—'],['Estado',e.networkStatus],['Vazão',e.flowRate.toFixed(2)+' m³/s'],
      ['Temperatura',e.airTemperature.toFixed(2)+' °C'],
      ...(!world.thermalSystems?.simpleCooling?[['Pressão',e.pressure.toFixed(1)+' Pa']]:[]),
      ['Direção',dirGlyph(e.direction)],['Racks atendidos',served.map(item=>item.rack.name||'Rack').join(', ')||'Nenhum'],
      ['Velocidade',e.dischargeVelocity.toFixed(2)+' m/s'],['Frio entregue',formatPower(e.coolingDelivered)],['Peso da saída',e.flowWeight||1],
      );
    }

    if(e.power)rows.push(['Consumo',formatPower(e.powerBlocked||e.enabled===false?0:e.power)]);

    const hasPowerControl=POWER_DEVICE_TYPES.has(e.type)&&typeof e.enabled==='boolean',cancelled=e.type==='serverRack'&&e.status==='CANCELLED';
    let state;
    if(e.type==='technician')state=e.action==='working'?{id:'stable',label:'EM ATENDIMENTO',color:'#34d399'}:e.action==='moving'?{id:'warm',label:'A CAMINHO',color:'#38bdf8'}:e.action==='cooldown'?{id:'warm',label:'EM INTERVALO',color:'#fbbf24'}:{id:'stable',label:'EM PATRULHA',color:'#34d399'};
    else if(cancelled)state={id:'warm',label:'CONTRATO ENCERRADO',color:'#94a3b8'};
    else if(e.type==='battery')state={id:e.operationState==='DISCHARGING'?'warm':e.operationState==='CHARGING'?'stable':e.operationState==='OFF'?'warm':'stable',label:e.operationState==='DISCHARGING'?'FORNECENDO ENERGIA':e.operationState==='CHARGING'?'CARREGANDO':e.operationState==='FULL'?'CARGA COMPLETA':e.operationState==='EMPTY'?'SEM CARGA':e.operationState==='OFF'?'DESLIGADA':'EM ESPERA',color:e.operationState==='DISCHARGING'?'#fbbf24':e.operationState==='CHARGING'?'#38bdf8':e.operationState==='OFF'?'#94a3b8':'#34d399'};
    else if(e.type==='solarPanel')state={id:e.enabled&&e.generationW>0?'stable':'warm',label:e.enabled&&e.generationW>0?'GERANDO ENERGIA':e.enabled?'SEM IRRADIAÇÃO':'DESLIGADO',color:e.enabled&&e.generationW>0?'#34d399':'#fbbf24'};
    else if(hasPowerControl&&!e.enabled)state={id:'warm',label:'DESLIGADO',color:'#94a3b8'};
    else if(e.powerBlocked)state={id:'hot',label:'SEM ENERGIA',color:'#fb7185'};
    else if((fluidTypes.includes(e.type)||airDuctTypes.includes(e.type))&&e.networkStatus&&e.networkStatus!=='CLOSED'){
      const ready=e.networkStatus==='READY';state={id:ready?'stable':'warm',label:e.networkStatus,color:ready?'#34d399':'#f59e0b'};
    }
    else if(e.type==='coolingUnit'){
      const alarm=e.status==='OVERLOAD',online=['READY','PARTIAL LOAD','HIGH LOAD'].includes(e.status);
      state={id:alarm?'hot':online?'stable':'warm',label:alarm?'SOBRECARGA':e.status==='OFF'?'DESLIGADA':online?'EM OPERAÇÃO':e.status,color:alarm?'#fb7185':online?'#34d399':'#f59e0b'};
    }
    else if(e.type==='furnace')state={id:'hot',label:'ZONA QUENTE',color:'#f97316'};
    else state=temperature!=null?thermalState(temperature):{id:'stable',label:e.enabled?'OPERACIONAL':'DESLIGADO',color:'#34d399'};

    const sprite=SPRITES[spriteIdFor(e)];
    const outletControl=e.type==='supplyVent'&&world.thermalSystems?.simpleCooling?'<label class="kv"><span>Distribuição</span><select data-flow-mode><option value="auto" '+((e.flowMode||'auto')==='auto'?'selected':'')+'>Auto</option><option value="low" '+(e.flowMode==='low'?'selected':'')+'>Baixo</option><option value="medium" '+(e.flowMode==='medium'?'selected':'')+'>Médio</option><option value="high" '+(e.flowMode==='high'?'selected':'')+'>Alto</option></select></label>':'';
    const pumpControl=e.type==='pump'?'<label class="kv"><span>Modo da bomba</span><select data-pump-mode><option value="eco" '+(e.flowMode==='eco'?'selected':'')+'>ECO · 1,0 kg/s</option><option value="normal" '+((e.flowMode||'normal')==='normal'?'selected':'')+'>Normal · 1,5 kg/s</option><option value="boost" '+(e.flowMode==='boost'?'selected':'')+'>Boost · 2,0 kg/s</option></select></label>':'';
    const powerControl=hasPowerControl?'<button type="button" class="power-toggle '+(e.enabled?'is-on':'is-off')+'" data-power-toggle aria-label="'+(e.enabled?'Desligar':'Ligar')+' '+(e.name||entityLabel(e.type))+'" '+(cancelled?'disabled':'')+'><span aria-hidden="true">⏻</span><strong>'+(cancelled?'Equipamento indisponível':e.enabled?'Desligar aparelho':'Ligar aparelho')+'</strong><small>'+(cancelled?'Contrato encerrado':e.enabled?'Interromper consumo e operação':'Retomar consumo e operação')+'</small></button>':'';
    this.root.innerHTML='<div class="inspector-title"><div class="entity-symbol '+(sprite?'entity-sprite':'')+'" '+(sprite?'style="'+spriteIconStyle(e)+'"':'')+'>'+(sprite?'':this.symbol(e.type))+'</div><div><small>'+entityLabel(e.type)+'</small><h3>'+(e.name||entityLabel(e.type))+'</h3></div></div><div class="status-badge status-'+state.id+'"><i style="background:'+state.color+'"></i>'+state.label+'</div>'+rows.map(r=>'<div class="kv"><span>'+r[0]+'</span><strong>'+r[1]+'</strong></div>').join('')+outletControl+pumpControl+powerControl;
    this.root.querySelector('[data-flow-mode]')?.addEventListener('change',event=>{const mode=event.currentTarget.value;e.flowMode=mode;e.flowWeight=({auto:1,low:1,medium:2,high:3})[mode];});
    this.root.querySelector('[data-pump-mode]')?.addEventListener('change',event=>{e.flowMode=event.currentTarget.value;if(world.fluidSystem)world.fluidSystem.lastTopologyVersion=-1;});
    this.root.querySelector('[data-power-toggle]')?.addEventListener('click',()=>this.onPowerToggle(e));
  }

  tile(world,x,y){
    if(!world.inBounds(x,y)){this.target=null;return;}
    const tile=world.tileMap.get(x,y),speed=Math.hypot(tile.airflowX,tile.airflowY),state=thermalState(tile.temperature);
    if(world.thermalSystems?.simpleCooling){
      const zone=(world.zones||[]).find(item=>x>=item.x&&y>=item.y&&x<item.x+item.width&&y<item.y+item.height);
      this.root.innerHTML='<div class="inspector-title"><div class="entity-symbol">□</div><div><small>CÉLULA '+x+', '+y+'</small><h3>'+tile.material.name+'</h3></div></div><div class="status-badge status-'+state.id+'"><i style="background:'+state.color+'"></i>'+state.label+'</div>'+
        '<div class="kv"><span>Temperatura</span><strong>'+tile.temperature.toFixed(2)+' °C</strong></div>'+
        (zone?'<div class="kv"><span>Zona</span><strong>'+zone.name+'</strong></div>':'')+
        '<div class="kv"><span>Fluxo de ar</span><strong>'+speed.toFixed(2)+' m/s</strong></div>';
      return;
    }
    const i=world.index(x,y);
    const pressure=world.airPressure?.[i]||0,divergence=world.airDivergence?.[i]||0,wall=world.airWallProximity?.[i]||0;
    this.root.innerHTML='<div class="inspector-title"><div class="entity-symbol">□</div><div><small>AIR CELL '+x+', '+y+'</small><h3>'+tile.material.name+'</h3></div></div><div class="status-badge status-'+state.id+'"><i style="background:'+state.color+'"></i>'+state.label+'</div>'+
      '<div class="kv"><span>Temperatura</span><strong>'+tile.temperature.toFixed(2)+' °C</strong></div>'+
      '<div class="kv"><span>Pressão</span><strong>'+(pressure>=0?'+':'')+pressure.toFixed(2)+' Pa</strong></div>'+
      '<div class="kv"><span>Velocity X</span><strong>'+tile.airflowX.toFixed(2)+' m/s</strong></div>'+
      '<div class="kv"><span>Velocity Y</span><strong>'+tile.airflowY.toFixed(2)+' m/s</strong></div>'+
      '<div class="kv"><span>Speed</span><strong>'+speed.toFixed(2)+' m/s</strong></div>'+
      '<div class="kv"><span>Divergência</span><strong>'+divergence.toFixed(4)+'</strong></div>'+
      '<div class="kv"><span>Wall proximity</span><strong>'+wall+'</strong></div>'+
      '<div class="kv"><span>Energia térmica</span><strong>'+formatEnergy(tile.thermalEnergy)+'</strong></div>';
  }

  symbol(type){return ({machine:'▣',serverRack:'▥',computeRack:'▥',furnace:'♨',passiveHeat:'•',fan:'✣',exhaust:'◉',pipe:'━',pump:'⟳',tank:'▰',radiator:'▥',exchanger:'HX',waterChiller:'❄',sensor:'°',coolingUnit:'❄',supplyVent:'↓',duct:'═'}[type]||'□');}
}
