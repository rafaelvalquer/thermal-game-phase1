import { formatEnergy, formatPower } from '../utils/MathUtils.js';
import { entityLabel, thermalState } from '../rendering/VisualTheme.js';

const fluidTypes=['pipe','pump','tank','radiator','exchanger'];

export class Inspector {
  constructor(root){this.root=root;this.target=null;}
  setTarget(target){this.target=target;}

  update(world){
    const t=this.target;
    if(!t){
      this.root.innerHTML='<div class="inspector-empty"><span>⌖</span><strong>Nenhuma seleção</strong><p>Clique no mapa para ver temperatura, energia, fluxo e estado operacional.</p></div>';
      return;
    }
    if(t.kind==='entity'&&!world.entities.includes(t.entity)){this.target=null;return this.update(world);}
    if(t.kind==='entity')return this.entity(world,t.entity);
    return this.tile(world,t.x,t.y);
  }

  entity(world,e){
    let temperature=null,rows=[['Posição',e.x+', '+e.y]];
    if(e.isHeatMachine){
      temperature=e.temperature;
      rows.push(['Temperatura',e.temperature.toFixed(2)+' °C'],['Geração',formatPower(e.heatOutput*(e.loadMultiplier||1))],['Resfriamento',formatPower(e.coolingPower)],['Operação',e.started?'Ligada':'Aguardando']);if(e.type==='serverRack')rows.push(['Entrada de ar',e.airIntakeDirection.x>0?'→':e.airIntakeDirection.x<0?'←':e.airIntakeDirection.y>0?'↓':'↑'],['Saída de ar',e.airExhaustDirection.x>0?'→':e.airExhaustDirection.x<0?'←':e.airExhaustDirection.y>0?'↓':'↑']);
    }
    if(fluidTypes.includes(e.type)){
      temperature=e.waterTemperature;
      rows.push(['Água',e.waterTemperature.toFixed(2)+' °C'],['Vazão',e.flowRate.toFixed(2)+' kg/s'],['Resistência',String(e.resistance||0)]);
    }
    if(e.type==='sensor'){
      temperature=e.current;
      rows.push(['Atual',e.current.toFixed(2)+' °C'],['Média',e.average.toFixed(2)+' °C'],['Máxima',e.max.toFixed(2)+' °C']);
    }
    if(e.type==='fan'||e.type==='exhaust'){
      const glyph=e.direction.x>0?'→':e.direction.x<0?'←':e.direction.y>0?'↓':'↑';
      rows.push(['Direção',glyph],['Airflow',e.airflow.toFixed(1)+' m/s'],['Alcance',e.range+' tiles']);
    }
    if(e.power)rows.push(['Consumo',formatPower(e.power)]);
    const state=e.type==='furnace'?{id:'hot',label:'ZONA QUENTE',color:'#f97316'}:(temperature!=null?thermalState(temperature):{id:'stable',label:e.enabled?'OPERACIONAL':'DESLIGADO',color:'#34d399'});
    this.root.innerHTML='<div class="inspector-title"><div class="entity-symbol">'+this.symbol(e.type)+'</div><div><small>'+entityLabel(e.type)+'</small><h3>'+(e.name||entityLabel(e.type))+'</h3></div></div><div class="status-badge status-'+state.id+'"><i style="background:'+state.color+'"></i>'+state.label+'</div>'+rows.map(r=>'<div class="kv"><span>'+r[0]+'</span><strong>'+r[1]+'</strong></div>').join('');
  }

  tile(world,x,y){
    if(!world.inBounds(x,y)){this.target=null;return;}
    const tile=world.tileMap.get(x,y),speed=Math.hypot(tile.airflowX,tile.airflowY),state=thermalState(tile.temperature);
    this.root.innerHTML='<div class="inspector-title"><div class="entity-symbol">□</div><div><small>TILE '+x+', '+y+'</small><h3>'+tile.material.name+'</h3></div></div><div class="status-badge status-'+state.id+'"><i style="background:'+state.color+'"></i>'+state.label+'</div><div class="kv"><span>Temperatura</span><strong>'+tile.temperature.toFixed(2)+' °C</strong></div><div class="kv"><span>Energia térmica</span><strong>'+formatEnergy(tile.thermalEnergy)+'</strong></div><div class="kv"><span>Condutividade</span><strong>'+tile.material.conductivity+' W/m·K</strong></div><div class="kv"><span>Airflow</span><strong>'+speed.toFixed(2)+' m/s</strong></div>';
  }

  symbol(type){return ({machine:'▣',serverRack:'▥',furnace:'♨',passiveHeat:'•',fan:'✣',exhaust:'◉',pipe:'━',pump:'⟳',tank:'▰',radiator:'▥',exchanger:'HX',sensor:'°'}[type]||'□');}
}
