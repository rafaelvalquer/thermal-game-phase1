import { formatEnergy, formatPower } from '../utils/MathUtils.js';

export class MetricsPanel {
  constructor(root){this.root=root;}
  update(sim,build,level){
    const m=sim.metrics,mission=sim.mission,pct=Math.min(100,mission.holdSeconds/(level.missionDuration||300)*100);
    const maxAirTemp=m.maxAirTemp??m.maxTemp,maxMachineTemp=m.maxMachineTemp??0;
    const airThermal=maxAirTemp>=80?'critical':maxAirTemp>50?'warn':'ok';
    const machineThermal=maxMachineTemp>=80?'critical':maxMachineTemp>50?'warn':'ok';
    const power=m.powerDraw>level.powerLimit?'critical':m.powerDraw>level.powerLimit*.8?'warn':'ok';
    this.root.innerHTML=
      '<div class="metric-grid">'+
        this.card('△','Ar máximo',maxAirTemp.toFixed(1)+' °C',airThermal)+
        this.card('♨','Máquina mais quente',maxMachineTemp.toFixed(1)+' °C',machineThermal)+
        this.card('≈','Média do ar',m.avgTemp.toFixed(1)+' °C','ok')+
        this.card('ϟ',sim.simpleCooling?'Consumo elétrico':'Consumo',formatPower(m.powerDraw)+' / '+formatPower(level.powerLimit),power)+
        this.card('▤','Frio entregue',formatPower(m.coolingDelivered||0),(m.coolingDelivered||0)>0?'ok':'warn')+
        this.card('$','Orçamento','$'+build.budget,build.budget<500?'warn':'ok')+
      '</div>'+
      '<div class="energy-list">'+
        (sim.simpleCooling?'<div class="metric"><span>Capacidade instalada</span><strong>'+formatPower(m.coolingInstalledCapacity||0)+'</strong></div><div class="metric"><span>Capacidade disponível</span><strong>'+formatPower(m.coolingAvailableCapacity||0)+'</strong></div><div class="metric"><span>Reserva</span><strong>'+Math.max(0,Math.round((m.coolingReserveMargin||0)*100))+'%</strong></div><div class="metric"><span>Condensadoras</span><strong>'+(sim.cooling?.units.filter(unit=>unit.enabled&&unit.networkStatus==='READY').length||0)+' / '+(sim.cooling?.units.length||0)+' online</strong></div>':'')+
        '<div class="metric"><span>Exterior</span><strong>'+sim.world.environment.temperature.toFixed(1)+' °C</strong></div>'+
        '<div class="metric"><span>Calor gerado</span><strong>'+formatEnergy(m.generatedHeat)+'</strong></div>'+
        '<div class="metric"><span>Calor ao exterior</span><strong>'+formatEnergy(m.externalEnergy)+'</strong></div>'+
        '<div class="metric"><span>Balanço energético</span><strong class="'+(Math.abs(m.energyBalance)>1000?'warn':'')+'">'+formatEnergy(m.energyBalance)+'</strong></div>'+
      '</div>'+
      (sim.datacenter?'':'<div class="mission-meter"><div class="mission-meter-head"><span>Estabilidade da missão</span><strong>'+Math.floor(mission.holdSeconds)+' / '+level.missionDuration+' s</strong></div><div class="mission-progress"><div style="width:'+pct+'%"></div></div></div>');
  }
  card(icon,label,value,state){return '<div class="metric-card '+state+'"><span class="metric-icon">'+icon+'</span><small>'+label+'</small><strong>'+value+'</strong></div>';}
}
