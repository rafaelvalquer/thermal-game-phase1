export class MissionDebriefing {
  constructor(game,campaign){this.game=game;this.campaign=campaign;this.shown=false;}

  show(){
    if(this.shown)return;this.shown=true;
    const sim=this.game.sim,won=sim.mission.state==='won',modal=document.querySelector('#endModal');
    if(!modal)return;
    const result={
      cost:this.game.level.budget-this.game.build.budget,
      maxPower:Math.max(0,...sim.history.map(h=>h.power)),
      maxTemperature:Math.max(sim.metrics.maxTemp,...sim.history.map(h=>h.max)),
      completionTime:sim.elapsed,
      externalEnergy:sim.metrics.externalEnergy,
    };
    if(won)this.campaign.completeLevel(this.game.level,result);
    modal.innerHTML='<div class="end-card"><span>THERMAL LAB · FASE '+String(this.game.level.number).padStart(2,'0')+'</span><h2>'+(won?'MISSÃO CONCLUÍDA':'FALHA TÉRMICA')+'</h2><p>'+(won?'A instalação permaneceu dentro dos critérios operacionais exigidos.':sim.mission.failReason)+'</p>'+
      '<div class="debrief-grid"><div><small>Temperatura máxima</small><strong>'+result.maxTemperature.toFixed(1)+'°C</strong></div><div><small>Potência máxima</small><strong>'+(result.maxPower/1000).toFixed(2)+' kW</strong></div><div><small>Custo instalado</small><strong>$'+result.cost+'</strong></div><div><small>Tempo</small><strong>'+Math.round(result.completionTime)+' s</strong></div></div>'+
      '<div class="end-actions"><button onclick="location.reload()">← Voltar à campanha</button>'+(won&&this.game.level.number<this.campaign.levels.length?'<button class="primary" onclick="location.reload()">Próxima fase desbloqueada</button>':'')+'</div></div>';
    modal.classList.add('show');
  }
}
