import { formatEnergy, formatPower } from '../utils/MathUtils.js';

// Telemetry is revealed progressively: 1 = temperature, power and mission;
// 2 adds cooling capacity; 3 (default) adds the full energy accounting.
export const telemetryLevel=level=>Math.max(1,Math.min(3,Number(level?.uiLevel)||3));

export class MetricsPanel {
  constructor(root){this.root=root;}
  update(sim,build,level){
    const m=sim.metrics,mission=sim.mission,pct=Math.min(100,mission.holdSeconds/(level.missionDuration||300)*100),tier=telemetryLevel(level);
    const maxAirTemp=m.maxAirTemp??m.maxTemp,maxMachineTemp=m.maxMachineTemp??0;
    const airThermal=maxAirTemp>=80?'critical':maxAirTemp>50?'warn':'ok';
    const machineThermal=maxMachineTemp>=80?'critical':maxMachineTemp>50?'warn':'ok';
    const limit=level.powerLimit||0,power=m.powerDraw||0,powerState=limit&&power>limit?'critical':limit&&power>limit*.9?'warn':'ok';
    const cards=tier===1?
      this.card('♨','Máquina mais quente',maxMachineTemp.toFixed(1)+' °C',machineThermal)+
      this.card('△','Ar máximo',maxAirTemp.toFixed(1)+' °C',airThermal)+
      this.card('ϟ','Consumo',formatPower(power)+(limit?' / '+formatPower(limit):''),powerState)+
      this.card('☀','Exterior',sim.world.environment.temperature.toFixed(1)+' °C','ok'):
      this.card('△','Ar máximo',maxAirTemp.toFixed(1)+' °C',airThermal)+
      this.card('♨','Máquina mais quente',maxMachineTemp.toFixed(1)+' °C',machineThermal)+
      this.card('≈','Média do ar',m.avgTemp.toFixed(1)+' °C','ok')+
      this.card('▤','Frio entregue',formatPower(m.coolingDelivered||0),(m.coolingDelivered||0)>0?'ok':'warn');
    const cooling=sim.simpleCooling?'<div class="metric"><span>Capacidade instalada</span><strong>'+formatPower(m.coolingInstalledCapacity||0)+'</strong></div><div class="metric"><span>Capacidade disponível</span><strong>'+formatPower(m.coolingAvailableCapacity||0)+'</strong></div><div class="metric"><span>Reserva</span><strong>'+Math.max(0,Math.round((m.coolingReserveMargin||0)*100))+'%</strong></div><div class="metric"><span>Condensadoras</span><strong>'+(sim.cooling?.units.filter(unit=>unit.enabled&&unit.networkStatus==='READY').length||0)+' / '+(sim.cooling?.units.length||0)+' online</strong></div>':'';
    const energy='<div class="metric"><span>Calor gerado</span><strong>'+formatEnergy(m.generatedHeat)+'</strong></div>'+
      '<div class="metric"><span>Calor ao exterior</span><strong>'+formatEnergy(m.externalEnergy)+'</strong></div>'+
      '<div class="metric"><span>Balanço energético</span><strong class="'+(Math.abs(m.energyBalance)>1000?'warn':'')+'">'+formatEnergy(m.energyBalance)+'</strong></div>';
    const list=tier===1?'':'<div class="energy-list">'+cooling+'<div class="metric"><span>Exterior</span><strong>'+sim.world.environment.temperature.toFixed(1)+' °C</strong></div>'+(tier>=3?energy:'')+'</div>';
    this.root.innerHTML='<div class="metric-grid">'+cards+'</div>'+list+
      (sim.datacenter?'':'<div class="mission-meter"><div class="mission-meter-head"><span>Estabilidade da missão</span><strong>'+Math.floor(mission.holdSeconds)+' / '+level.missionDuration+' s</strong></div><div class="mission-progress"><div style="width:'+pct+'%"></div></div></div>');
  }
  card(icon,label,value,state){return '<div class="metric-card '+state+'"><span class="metric-icon">'+icon+'</span><small>'+label+'</small><strong>'+value+'</strong></div>';}
}
