import { MissionBriefing } from './MissionBriefing.js';

export class CampaignScreen {
  constructor(root,campaign,onStart){this.root=root;this.campaign=campaign;this.onStart=onStart;this.briefing=new MissionBriefing(root,campaign,onStart);}

  render(){
    const cards=this.campaign.levels.map(level=>{
      const unlocked=this.campaign.isUnlocked(level),completed=this.campaign.isCompleted(level),best=this.campaign.state.bestResults[level.id];
      const stars='★'.repeat(level.difficulty)+'☆'.repeat(Math.max(0,6-level.difficulty));
      return '<button class="campaign-card '+(!unlocked?'locked':'')+' '+(completed?'completed':'')+'" data-level="'+level.id+'" '+(!unlocked?'disabled':'')+'>'+
        '<div class="campaign-card-top"><span class="level-no">'+String(level.number).padStart(2,'0')+'</span><span class="level-state">'+(completed?'CONCLUÍDA':unlocked?'DISPONÍVEL':'BLOQUEADA')+'</span></div>'+
        '<h2>'+level.name+'</h2><p>'+level.description+'</p>'+
        '<div class="campaign-tags"><span>'+stars+'</span><span>'+level.environment.outdoorTemperature+'°C EXT</span><span>'+(level.powerLimit/1000).toFixed(0)+' kW</span></div>'+
        (best?'<div class="campaign-best">Melhor máx. '+Number(best.maxTemperature||0).toFixed(1)+'°C · '+Math.round(best.completionTime||0)+'s</div>':'')+
      '</button>';
    }).join('');

    this.root.innerHTML=
      '<div class="campaign-shell"><header class="campaign-header"><div class="brand large"><div class="brand-mark"><span>Δ</span><small>T</small></div><div><h1>THERMAL LAB</h1><p>THERMODYNAMIC OPERATIONS</p></div></div><div class="campaign-progress"><span>PROGRESSO</span><strong>'+this.campaign.state.completedLevels.length+' / '+this.campaign.levels.length+'</strong></div></header>'+
      '<main class="campaign-main"><div class="campaign-intro"><span>CAMPAIGN // THERMAL CONTROL</span><h2>Primeira Campanha</h2><p>Domine condução, airflow e transporte térmico por água em instalações progressivamente mais complexas.</p></div><div class="campaign-grid">'+cards+'</div></main>'+
      '<footer class="campaign-footer"><button data-reset>Reiniciar progresso</button><span>A física determina a temperatura.</span></footer></div>';

    this.root.querySelectorAll('[data-level]').forEach(card=>card.onclick=()=>this.briefing.show(this.campaign.getLevel(card.dataset.level)));
    this.root.querySelector('[data-reset]').onclick=()=>{if(confirm('Apagar o progresso da campanha?')){this.campaign.resetProgress();this.render();}};
  }
}
