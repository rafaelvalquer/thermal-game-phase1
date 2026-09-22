import { formatEnergy, formatPower } from '../utils/MathUtils.js';
import { POWER_LIMIT_W } from '../utils/Constants.js';
export class MetricsPanel {
  constructor(root){this.root=root;}
  update(sim,build){const m=sim.metrics,mission=sim.mission,pct=Math.min(100,mission.safeSeconds/300*100);this.root.innerHTML=`
    <div class="metric"><span>Máx.</span><strong class="${m.maxTemp>40?'warn':''}">${m.maxTemp.toFixed(1)} °C</strong></div>
    <div class="metric"><span>Média ar</span><strong>${m.avgTemp.toFixed(1)} °C</strong></div>
    <div class="metric"><span>Energia elétrica</span><strong class="${m.powerDraw>POWER_LIMIT_W?'danger':''}">${formatPower(m.powerDraw)} / 10 kW</strong></div>
    <div class="metric"><span>Orçamento</span><strong>$${build.budget}</strong></div>
    <div class="metric"><span>Calor gerado</span><strong>${formatEnergy(m.generatedHeat)}</strong></div>
    <div class="metric"><span>Calor ao exterior</span><strong>${formatEnergy(m.externalEnergy)}</strong></div>
    <div class="metric"><span>Energy balance</span><strong class="${Math.abs(m.energyBalance)>1000?'warn':''}">${formatEnergy(m.energyBalance)}</strong></div>
    <div class="mission-progress"><div style="width:${pct}%"></div></div>`;}
}
