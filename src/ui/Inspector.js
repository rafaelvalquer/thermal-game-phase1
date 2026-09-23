import { formatEnergy, formatPower } from '../utils/MathUtils.js';
import { entityLabel, thermalState } from '../rendering/VisualTheme.js';
import { SPRITES } from '../rendering/sprites/SpriteManifest.js';

const fluidTypes=['pipe','pump','tank','radiator','exchanger'];
const airDuctTypes=['smallDuct','mediumDuct','largeDuct'];
const dirGlyph=d=>d?.x>0?'→':d?.x<0?'←':d?.y>0?'↓':d?.y<0?'↑':'—';

export class Inspector {
  constructor(root){this.root=root;this.target=null;}
  setTarget(target){this.target=target;}

  update(world){
    const t=this.target;
    if(!t){
      this.root.innerHTML='<div class="inspector-empty"><span>⌖</span><strong>Nenhuma seleção</strong><p>Clique no mapa para ver temperatura, pressão, energia, fluxo e estado operacional.</p></div>';
      return;
    }
    if(t.kind==='entity'&&!world.entities.includes(t.entity)&&!world.allUtilities().includes(t.entity)){this.target=null;return this.update(world);}
    if(t.kind==='entity')return this.entity(world,t.entity);
    return this.tile(world,t.x,t.y);
  }

  entity(world,e){
    let temperature=null,rows=[['Posição',e.x+', '+e.y]];

    if(e.isHeatMachine){
      temperature=e.temperature;
      rows.push(
        ['Temperatura',e.temperature.toFixed(2)+' °C'],
        ['Geração',formatPower(e.heatOutput*(e.loadMultiplier||1))],
        ['Resfriamento',formatPower(e.coolingPower)],
        ['Operação',e.started?'Ligada':'Aguardando']
      );
      if(e.type==='serverRack')rows.push(['Entrada de ar',dirGlyph(e.airIntakeDirection)],['Saída de ar',dirGlyph(e.airExhaustDirection)]);
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
      if(e.type==='pump')rows.push(['Saída da bomba',dirGlyph(e.direction)],['Drive hidráulico',String(e.hydraulicPower)]);
      if(e.type==='exchanger'){
        const machine=world.entities.find(x=>x.id===e.machineId);
        rows.push(['Máquina',machine?.name||'—'],['Troca térmica',formatPower(e.thermalPower||0)]);
      }
      if(e.type==='radiator')rows.push(
        ['Calor rejeitado',formatPower(e.thermalPower||0)],
        ['Ar entrada',Number(e.airInTemperature??25).toFixed(2)+' °C'],
        ['Ar saída',Number(e.airOutTemperature??25).toFixed(2)+' °C'],
        ['Fan boost',Number(e.fanBoost||1).toFixed(2)+'×']
      );
    }

    if(e.type==='sensor'){
      temperature=e.current;
      rows.push(['Atual',e.current.toFixed(2)+' °C'],['Média',e.average.toFixed(2)+' °C'],['Máxima',e.max.toFixed(2)+' °C']);
    }

    if(e.type==='fan'||e.type==='exhaust'){
      rows.push(
        ['Direção',dirGlyph(e.direction)],
        ['Free Flow',Number(e.qFree||0).toFixed(2)+' m³/s'],
        ['Vazão atual',Number(e.currentFlow||0).toFixed(2)+' m³/s'],
        ['Pressão',Number(e.currentPressureRise||0).toFixed(1)+' Pa'],
        ['Velocidade',Number(e.currentVelocity||0).toFixed(2)+' m/s'],
        ['Operating Point',(Number(e.operatingPoint||0)*100).toFixed(0)+'%'],
        ['Eficiência',(Number(e.efficiency||0)*100).toFixed(0)+'%']
      );
    }

    if(airDuctTypes.includes(e.type))rows.push(
      ['Rede HVAC',e.networkId||'—'],['Tipo',e.networkRole==='return'?'Retorno':e.networkRole==='supply'?'Insuflação':e.networkRole==='invalid'?'Inválido':'Não classificado'],['Estado',e.networkStatus||'DISCONNECTED'],
      ['Seção',e.crossSectionArea.toFixed(2)+' m²'],['Temperatura',e.airTemperature.toFixed(2)+' °C'],
      ['Pressão',e.pressure.toFixed(1)+' Pa'],['Perda de carga',e.pressureLoss.toFixed(2)+' Pa'],
      ['Vazão',e.flowRate.toFixed(2)+' m³/s'],['Velocidade',e.velocity.toFixed(2)+' m/s'],
      ['Instalação',e.embedded?'Embutido':'Exposto'],['Isolamento',e.insulated?'Isolado':'Padrão'],
    );
    if(e.type==='airHandler'){
      const circuit=world.hvac?.refrigerantCircuitById(e.refrigerantCircuitId);
      rows.push(
      ['Estado',e.status],['Rede insuflação',e.supplyNetworkId||'—'],['Rede retorno',e.returnNetworkId||'—'],
      ['Circuito frigorífico',e.refrigerantCircuitId||e.refrigerantStatus||'—'],['Condensadora',e.condenserId||'—'],
      ['Retorno',e.returnTemperature.toFixed(1)+' °C'],['Insuflação',e.supplyTemperature.toFixed(1)+' °C'],
      ['Alvo',e.targetSupplyTemperature.toFixed(1)+' °C'],['Vazão',e.currentFlow.toFixed(2)+' m³/s'],
      ['Vazão real ins. / ret.',e.supplyFlow.toFixed(2)+' / '+e.returnFlow.toFixed(2)+' m³/s'],
      ['Capacidade rede ins. / ret.',e.supplyAvailableFlow.toFixed(2)+' / '+e.returnAvailableFlow.toFixed(2)+' m³/s'],
      ['Pressão insuflação / retorno',e.supplyPressure.toFixed(1)+' / '+e.returnPressure.toFixed(1)+' Pa'],
      ['Demanda de frio',formatPower(e.coolingDemand)],['Frio entregue',formatPower(e.coolingPower)],
      ['Frio retirado da sala',formatPower(e.actualRoomCooling)],
      ['Capacidade',formatPower(e.coolingCapacity)],['Fator da linha',((circuit?.capacityFactor??0)*100).toFixed(0)+'%'],
      ['COP',e.cop.toFixed(2)],['Ventilador AH',formatPower(e.power)],['Compressor',formatPower(e.compressorPower)],
      ['Potência elétrica total',formatPower(e.power+e.compressorPower)],
      );
    }
    if(e.type==='condenser'){
      const circuit=world.hvac?.refrigerantCircuitById(e.refrigerantCircuitId);
      rows.push(
      ['Estado',e.status],['Circuito',e.refrigerantCircuitId||e.circuitStatus||'—'],['Comprimento da linha',(circuit?.length??0).toFixed(1)+' m'],
      ['Exterior',e.outdoorTemperature.toFixed(1)+' °C'],['Carga do evaporador',formatPower(e.coolingLoad)],['Calor rejeitado',formatPower(e.heatRejected)],
      ['Carga',e.availableCapacity?((e.heatRejected/e.availableCapacity)*100).toFixed(0)+'%':'0%'],
      ['Capacidade',formatPower(e.coolingCapacity)],['Compressor',formatPower(e.compressorPower)],
      ['Ventilador',formatPower(e.condenserFanPower)],['Potência elétrica',formatPower(e.electricalPower)],['Local',e.indoor?'Interno':'Externo'],
      );
    }
    if(e.type==='refrigerantLine'){
      const circuit=world.hvac?.refrigerantCircuitById(e.circuitId);
      rows.push(['Circuito',e.circuitId||'—'],['Estado',e.circuitStatus||'OPEN CIRCUIT'],
        ['Comprimento do circuito',(circuit?.length??e.length??0).toFixed(1)+' m'],
        ['Capacidade',(Number(e.capacityFactor||0)*100).toFixed(0)+'%'],['Embutida',e.embedded?'Sim':'Não'],['Isolamento',e.insulated?'Isolada':'Padrão']);
    }
    if(e.type==='supplyVent'||e.type==='returnVent')rows.push(
      ['Rede HVAC',e.networkId||'—'],['Estado',e.networkStatus],['Vazão',e.flowRate.toFixed(2)+' m³/s'],
      ['Temperatura',e.airTemperature.toFixed(2)+' °C'],['Pressão',e.pressure.toFixed(1)+' Pa'],
      ...(e.type==='supplyVent'?[['Velocidade',e.dischargeVelocity.toFixed(2)+' m/s'],['Frio entregue',formatPower(e.coolingDelivered)]]:[]),
    );
    if(e.type==='ductDamper')rows.push(['Abertura',(e.opening*100).toFixed(0)+'%'],['Controle','U abre · J fecha'],['Estado',e.networkStatus]);

    if(e.power)rows.push(['Consumo',formatPower(e.power)]);

    let state;
    if((fluidTypes.includes(e.type)||airDuctTypes.includes(e.type)||e.type==='refrigerantLine'||e.type==='ductDamper')&&e.networkStatus&&e.networkStatus!=='CLOSED'){
      const ready=e.networkStatus==='READY';state={id:ready?'stable':'warm',label:e.networkStatus,color:ready?'#34d399':'#f59e0b'};
    }
    else if(e.type==='furnace')state={id:'hot',label:'ZONA QUENTE',color:'#f97316'};
    else state=temperature!=null?thermalState(temperature):{id:'stable',label:e.enabled?'OPERACIONAL':'DESLIGADO',color:'#34d399'};

    const sprite=SPRITES[e.type];
    this.root.innerHTML='<div class="inspector-title"><div class="entity-symbol '+(sprite?'entity-sprite':'')+'" '+(sprite?'style="--entity-sprite:url('+sprite.path+')"':'')+'>'+(sprite?'':this.symbol(e.type))+'</div><div><small>'+entityLabel(e.type)+'</small><h3>'+(e.name||entityLabel(e.type))+'</h3></div></div><div class="status-badge status-'+state.id+'"><i style="background:'+state.color+'"></i>'+state.label+'</div>'+rows.map(r=>'<div class="kv"><span>'+r[0]+'</span><strong>'+r[1]+'</strong></div>').join('');
  }

  tile(world,x,y){
    if(!world.inBounds(x,y)){this.target=null;return;}
    const tile=world.tileMap.get(x,y),i=world.index(x,y),speed=Math.hypot(tile.airflowX,tile.airflowY),state=thermalState(tile.temperature);
    const pressure=world.airPressure?.[i]||0,divergence=world.airDivergence?.[i]||0,wall=world.airWallProximity?.[i]||0;
    this.root.innerHTML='<div class="inspector-title"><div class="entity-symbol">□</div><div><small>AIR CELL '+x+', '+y+'</small><h3>'+tile.material.name+'</h3></div></div><div class="status-badge status-'+state.id+'"><i style="background:'+state.color+'"></i>'+state.label+'</div>'+
      '<div class="kv"><span>Temperatura</span><strong>'+tile.temperature.toFixed(2)+' °C</strong></div>'+
      '<div class="kv"><span>Pressão</span><strong>'+(pressure>=0?'+':'')+pressure.toFixed(2)+' Pa</strong></div>'+
      (()=>{const zone=(world.zones||[]).find(item=>x>=item.x&&y>=item.y&&x<item.x+item.width&&y<item.y+item.height),hvacPressure=zone?world.hvacZonePressure?.get(zone.id):null;return Number.isFinite(hvacPressure)?'<div class="kv"><span>Pressão HVAC</span><strong>'+(hvacPressure>=0?'+':'')+hvacPressure.toFixed(2)+' Pa</strong></div>':'';})()+
      '<div class="kv"><span>Velocity X</span><strong>'+tile.airflowX.toFixed(2)+' m/s</strong></div>'+
      '<div class="kv"><span>Velocity Y</span><strong>'+tile.airflowY.toFixed(2)+' m/s</strong></div>'+
      '<div class="kv"><span>Speed</span><strong>'+speed.toFixed(2)+' m/s</strong></div>'+
      '<div class="kv"><span>Divergência</span><strong>'+divergence.toFixed(4)+'</strong></div>'+
      '<div class="kv"><span>Wall proximity</span><strong>'+wall+'</strong></div>'+
      '<div class="kv"><span>Energia térmica</span><strong>'+formatEnergy(tile.thermalEnergy)+'</strong></div>';
  }

  symbol(type){return ({machine:'▣',serverRack:'▥',furnace:'♨',passiveHeat:'•',fan:'✣',exhaust:'◉',pipe:'━',pump:'⟳',tank:'▰',radiator:'▥',exchanger:'HX',sensor:'°',airHandler:'AH',condenser:'CD',supplyVent:'↓',returnVent:'↑',smallDuct:'═',mediumDuct:'═',largeDuct:'═',ductDamper:'╫'}[type]||'□');}
}
