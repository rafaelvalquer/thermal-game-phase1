import { formatEnergy, formatPower } from '../utils/MathUtils.js';
import { POWER_LIMIT_W } from '../utils/Constants.js';

export class MetricsPanel {
  constructor(root){this.root=root;}
  update(sim,build){
    const m=sim.metrics,mission=sim.mission,pct=Math.min(100,mission.safeSeconds/300*100);
    const thermal=m.maxTemp>=80?'critical':m.maxTemp>40?'warn':'ok';
    const power=m.powerDraw>POWER_LIMIT_W?'critical':m.powerDraw>POWER_LIMIT_W*.8?'warn':'ok';
    this.root.innerHTML=
      '<div class="metric-grid">'+
        this.card('△','Temperatura máxima',m.maxTemp.toFixed(1)+' °C',thermal)+
        this.card('≈','Média do ar',m.avgTemp.toFixed(1)+' °C','ok')+
        this.card('ϟ','Potência',formatPower(m.powerDraw)+' / 10 kW',power)+
        this.card('$','Orçamento','$'+build.budget,build.budget<500?'warn':'ok')+
      '</div>'+
      '<div class="energy-list">'+
        '<div class="metric"><span>Calor gerado</span><strong>'+formatEnergy(m.generatedHeat)+'</strong></div>'+
        '<div class="metric"><span>Calor ao exterior</span><strong>'+formatEnergy(m.externalEnergy)+'</strong></div>'+
        '<div class="metric"><span>Energy balance</span><strong class="'+(Math.abs(m.energyBalance)>1000?'warn':'')+'">'+formatEnergy(m.energyBalance)+'</strong></div>'+
      '</div>'+
      '<div class="mission-meter"><div class="mission-meter-head"><span>Estabilidade térmica</span><strong>'+Math.floor(mission.safeSeconds)+' / 300 s</strong></div><div class="mission-progress"><div style="width:'+pct+'%"></div></div></div>';
  }
  card(icon,label,value,state){return '<div class="metric-card '+state+'"><span class="metric-icon">'+icon+'</span><small>'+label+'</small><strong>'+value+'</strong></div>';}
}
