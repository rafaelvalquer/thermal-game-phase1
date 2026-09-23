import { formatEnergy, formatPower } from '../utils/MathUtils.js';

export class MetricsPanel {
  constructor(root){this.root=root;}
  update(sim,build,level){
    const m=sim.metrics,mission=sim.mission,pct=Math.min(100,mission.holdSeconds/(level.missionDuration||300)*100);
    const thermal=m.maxTemp>=80?'critical':m.maxTemp>50?'warn':'ok';
    const power=m.powerDraw>level.powerLimit?'critical':m.powerDraw>level.powerLimit*.8?'warn':'ok';
    this.root.innerHTML=
      '<div class="metric-grid">'+
        this.card('△','Temperatura máxima',m.maxTemp.toFixed(1)+' °C',thermal)+
        this.card('≈','Média do ar',m.avgTemp.toFixed(1)+' °C','ok')+
        this.card('ϟ','Cooling',formatPower(m.powerDraw)+' / '+formatPower(level.powerLimit),power)+
        this.card('▤','HVAC',formatPower(m.hvacCooling||0),m.hvacCooling>0?'ok':'warn')+
        this.card('$','Orçamento','$'+build.budget,build.budget<500?'warn':'ok')+
      '</div>'+
      '<div class="energy-list">'+
        '<div class="metric"><span>Exterior</span><strong>'+sim.world.environment.temperature.toFixed(1)+' °C</strong></div>'+
        '<div class="metric"><span>Calor gerado</span><strong>'+formatEnergy(m.generatedHeat)+'</strong></div>'+
        '<div class="metric"><span>Calor ao exterior</span><strong>'+formatEnergy(m.externalEnergy)+'</strong></div>'+
        '<div class="metric"><span>Energy balance</span><strong class="'+(Math.abs(m.energyBalance)>1000?'warn':'')+'">'+formatEnergy(m.energyBalance)+'</strong></div>'+
      '</div>'+
      '<div class="mission-meter"><div class="mission-meter-head"><span>Estabilidade da missão</span><strong>'+Math.floor(mission.holdSeconds)+' / '+level.missionDuration+' s</strong></div><div class="mission-progress"><div style="width:'+pct+'%"></div></div></div>';
  }
  card(icon,label,value,state){return '<div class="metric-card '+state+'"><span class="metric-icon">'+icon+'</span><small>'+label+'</small><strong>'+value+'</strong></div>';}
}
