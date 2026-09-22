import { formatEnergy, formatPower } from '../utils/MathUtils.js';
export class Inspector {
  constructor(root){this.root=root;this.target=null;}
  setTarget(target){this.target=target;}
  update(world){
    const t=this.target;if(!t){this.root.innerHTML='<div class="empty">Clique em um tile ou equipamento para inspecionar.</div>';return;}
    if(t.kind==='entity'&&!world.entities.includes(t.entity)){this.target=null;return this.update(world);}
    if(t.kind==='entity'){const e=t.entity;let rows=[['Tipo',e.type],['Posição',`${e.x}, ${e.y}`]];if(e.type==='machine')rows.push(['Temperatura',`${e.temperature.toFixed(2)} °C`],['Geração',formatPower(e.heatOutput)],['Resfriamento',formatPower(e.coolingPower)],['Estado',e.started?'Ligada':'Aguardando']);if(['pipe','pump','tank','radiator','exchanger'].includes(e.type))rows.push(['Água',`${e.waterTemperature.toFixed(2)} °C`],['Fluxo',`${e.flowRate.toFixed(2)} kg/s`]);if(e.type==='sensor')rows.push(['Atual',`${e.current.toFixed(2)} °C`],['Média',`${e.average.toFixed(2)} °C`],['Máxima',`${e.max.toFixed(2)} °C`]);if(e.power)rows.push(['Consumo',formatPower(e.power)]);this.root.innerHTML=`<h3>${e.name||e.type}</h3>${rows.map(r=>`<div class="kv"><span>${r[0]}</span><strong>${r[1]}</strong></div>`).join('')}`;
    } else {const {x,y}=t;if(!world.inBounds(x,y)){this.target=null;return;}const tile=world.tileMap.get(x,y),speed=Math.hypot(tile.airflowX,tile.airflowY);this.root.innerHTML=`<h3>Tile ${x}, ${y}</h3><div class="kv"><span>Material</span><strong>${tile.material.name}</strong></div><div class="kv"><span>Temperatura</span><strong>${tile.temperature.toFixed(2)} °C</strong></div><div class="kv"><span>Energia</span><strong>${formatEnergy(tile.thermalEnergy)}</strong></div><div class="kv"><span>Condutividade</span><strong>${tile.material.conductivity} W/m·K</strong></div><div class="kv"><span>Airflow</span><strong>${speed.toFixed(2)} m/s</strong></div>`;}
  }
}
