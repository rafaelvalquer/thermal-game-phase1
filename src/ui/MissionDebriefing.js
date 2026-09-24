export class MissionDebriefing {
  constructor(game,campaign,onCampaign,onStartLevel){this.game=game;this.campaign=campaign;this.onCampaign=onCampaign;this.onStartLevel=onStartLevel;this.shown=false;}

  show(){
    if(this.shown)return;this.shown=true;
    const sim=this.game.sim,won=sim.mission.state==='won',modal=document.querySelector('#endModal');
    if(!modal)return;
    const result={
      cost:this.game.level.budget-this.game.build.budget,
      maxPower:sim.metrics.maxPowerEver,
      maxTemperature:sim.metrics.maxTempEver,
      completionTime:sim.elapsed,
      externalEnergy:sim.metrics.externalEnergy,
    };
    if(won&&this.game.level.campaign!==false)this.campaign.completeLevel(this.game.level,result);
    modal.innerHTML='<div class="end-card"><span>THERMAL LAB · FASE '+String(this.game.level.number).padStart(2,'0')+'</span><h2>'+(won?'MISSÃO CONCLUÍDA':'FALHA TÉRMICA')+'</h2><p>'+(won?'A instalação permaneceu dentro dos critérios operacionais exigidos.':sim.mission.failReason)+'</p>'+
      '<div class="debrief-grid"><div><small>Temperatura máxima</small><strong>'+result.maxTemperature.toFixed(1)+'°C</strong></div><div><small>Potência máxima</small><strong>'+(result.maxPower/1000).toFixed(2)+' kW</strong></div><div><small>Custo instalado</small><strong>$'+result.cost+'</strong></div><div><small>Tempo</small><strong>'+Math.round(result.completionTime)+' s</strong></div></div>'+
      '<div class="end-actions"><button data-campaign>← Voltar à campanha</button>'+(won&&this.game.level.campaign!==false&&this.game.level.number<this.campaign.levels.length?'<button class="primary" data-next>Próxima fase</button>':'')+'<button data-restart>↻ Repetir fase</button></div></div>';
    modal.querySelector('[data-campaign]').onclick=()=>this.onCampaign();
    modal.querySelector('[data-restart]').onclick=()=>this.onStartLevel(this.game.level);
    modal.querySelector('[data-next]')?.addEventListener('click',()=>window.__thermalShowBriefing?.(this.campaign.getLevel(this.game.level.number+1)));
    modal.classList.add('show');
  }
}
