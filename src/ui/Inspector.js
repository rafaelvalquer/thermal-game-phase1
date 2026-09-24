import { formatEnergy, formatPower } from '../utils/MathUtils.js';
import { entityLabel, thermalState } from '../rendering/VisualTheme.js';
import { SPRITES } from '../rendering/sprites/SpriteManifest.js';

const fluidTypes=['pipe','pump','tank','radiator','exchanger'];
const airDuctTypes=['duct'];
const dirGlyph=d=>d?.x>0?'→':d?.x<0?'←':d?.y>0?'↓':d?.y<0?'↑':'—';

export class Inspector {
  constructor(root){this.root=root;this.target=null;}
  setTarget(target){this.target=target;}

  update(world){
    const t=this.target;
    if(!t){
      const simple=world.thermalSystems?.simpleCooling;
      this.root.innerHTML='<div class="inspector-empty"><span>⌖</span><strong>Nenhuma seleção</strong><p>'+(simple?'Clique em um equipamento para ver temperatura, refrigeração e estado.':'Clique no mapa para ver temperatura, pressão, energia, fluxo e estado operacional.')+'</p></div>';
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
        ['Geração',formatPower(e.heatGenerationPower||0)],
        ['Resfriamento',formatPower(e.coolingPower)],
        ['Balanço',formatPower(e.thermalBalance||0)],
        ['Operação',e.started?'Ligada':'Aguardando']
      );
      if(e.type==='serverRack')rows.push(['Cliente',e.clientId||'Independente'],['Potência',formatPower((e.currentPowerKW||0)*1000)+' / '+formatPower((e.maxPowerKW||0)*1000)],['Carga',(Number(e.cpuLoad||0)*100).toFixed(0)+'%'],['Entrada de ar',Number(e.inletTemperature??e.temperature).toFixed(1)+' °C'],['Saída de ar',Number(e.exhaustTemperature??e.temperature).toFixed(1)+' °C'],['Estado',e.status||'NORMAL'],['SLA',Number(e.slaTemperature||30).toFixed(1)+' °C máx.'],['Disponibilidade',Number(e.uptime??100).toFixed(2)+'%'],['Sentido de insuflação',dirGlyph(e.airIntakeDirection)],['Sentido de retorno',dirGlyph(e.airExhaustDirection)]);
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
    }

    if(airDuctTypes.includes(e.type)&&world.thermalSystems?.simpleCooling)rows.push(
      ['Rede',e.networkId||'—'],['Estado',e.networkStatus||'DISCONNECTED'],['Comprimento',String((world.coolingSystem?.networks||[]).find(n=>n.id===e.networkId)?.totalLength||0)+' tiles'],['Temperatura',Number(e.airTemperature||25).toFixed(1)+' °C'],['Vazão',Number(e.flowRate||0).toFixed(2)+' m³/s'],['Instalação',e.embedded?'Embutido':'Exposto']);

    if(e.type==='coolingUnit'){
      const network=(world.coolingSystem?.networks||[]).find(item=>item.sourceUnit===e);
      rows.push(['Modelo',({compact:'Compacta',commercial:'Comercial',industrial:'Industrial'})[e.tier]||'Comercial'],['Estado',e.status],['Rede',e.networkId||'—'],['Saídas',String(network?.vents.length||0)],
        ['Capacidade',formatPower(e.ratedCoolingCapacity)],['Capacidade disponível',formatPower(e.availableCapacity||0)],
        ['Carga',(Math.min(100,Math.round((e.loadRatio||0)*100)))+'%'],['Vazão',Number(e.currentAirFlow||0).toFixed(2)+' / '+e.maxAirFlow+' m³/s'],
        ['Retorno',Number(e.returnTemperature||25).toFixed(1)+' °C'],['Insuflação',Number(e.supplyTemperature||25).toFixed(1)+' °C'],
        ['Refrigeração',formatPower(e.currentCooling||0)+' / '+formatPower(e.ratedCoolingCapacity)],['Eficiência',e.cop>=3.4?'Alta':e.cop>=3?'Média':'Baixa'],
        ['Potência elétrica',formatPower(e.electricalPower||0)],['Calor rejeitado',formatPower(e.heatRejected||0)],['Local',e.indoor?'Interno':'Externo']);
    }
    if(e.type==='supplyVent')rows.push(
      ['Rede',e.networkId||'—'],['Estado',e.networkStatus],['Vazão',e.flowRate.toFixed(2)+' m³/s'],
      ['Temperatura',e.airTemperature.toFixed(2)+' °C'],
      ...(!world.thermalSystems?.simpleCooling?[['Pressão',e.pressure.toFixed(1)+' Pa']]:[]),
      ...(e.type==='supplyVent'?[['Velocidade',e.dischargeVelocity.toFixed(2)+' m/s'],['Frio entregue',formatPower(e.coolingDelivered)],['Peso da saída',e.flowWeight||1]]:[]),
    );

    if(e.power)rows.push(['Consumo',formatPower(e.power)]);

    let state;
    if((fluidTypes.includes(e.type)||airDuctTypes.includes(e.type))&&e.networkStatus&&e.networkStatus!=='CLOSED'){
      const ready=e.networkStatus==='READY';state={id:ready?'stable':'warm',label:e.networkStatus,color:ready?'#34d399':'#f59e0b'};
    }
    else if(e.type==='coolingUnit'){
      const alarm=e.status==='OVERLOAD',online=['READY','PARTIAL LOAD','HIGH LOAD'].includes(e.status);
      state={id:alarm?'hot':online?'stable':'warm',label:alarm?'SOBRECARGA':e.status==='OFF'?'DESLIGADA':online?'EM OPERAÇÃO':e.status,color:alarm?'#fb7185':online?'#34d399':'#f59e0b'};
    }
    else if(e.type==='furnace')state={id:'hot',label:'ZONA QUENTE',color:'#f97316'};
    else state=temperature!=null?thermalState(temperature):{id:'stable',label:e.enabled?'OPERACIONAL':'DESLIGADO',color:'#34d399'};

    const sprite=SPRITES[e.type];
    const outletControl=e.type==='supplyVent'&&world.thermalSystems?.simpleCooling?'<label class="kv"><span>Distribuição</span><select data-flow-mode><option value="auto" '+((e.flowMode||'auto')==='auto'?'selected':'')+'>Auto</option><option value="low" '+(e.flowMode==='low'?'selected':'')+'>Baixo</option><option value="medium" '+(e.flowMode==='medium'?'selected':'')+'>Médio</option><option value="high" '+(e.flowMode==='high'?'selected':'')+'>Alto</option></select></label>':'';
    this.root.innerHTML='<div class="inspector-title"><div class="entity-symbol '+(sprite?'entity-sprite':'')+'" '+(sprite?'style="--entity-sprite:url('+sprite.path+')"':'')+'>'+(sprite?'':this.symbol(e.type))+'</div><div><small>'+entityLabel(e.type)+'</small><h3>'+(e.name||entityLabel(e.type))+'</h3></div></div><div class="status-badge status-'+state.id+'"><i style="background:'+state.color+'"></i>'+state.label+'</div>'+rows.map(r=>'<div class="kv"><span>'+r[0]+'</span><strong>'+r[1]+'</strong></div>').join('')+outletControl;
    this.root.querySelector('[data-flow-mode]')?.addEventListener('change',event=>{const mode=event.currentTarget.value;e.flowMode=mode;e.flowWeight=({auto:1,low:1,medium:2,high:3})[mode];});
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

  symbol(type){return ({machine:'▣',serverRack:'▥',furnace:'♨',passiveHeat:'•',fan:'✣',exhaust:'◉',pipe:'━',pump:'⟳',tank:'▰',radiator:'▥',exchanger:'HX',sensor:'°',coolingUnit:'❄',supplyVent:'↓',duct:'═'}[type]||'□');}
}
