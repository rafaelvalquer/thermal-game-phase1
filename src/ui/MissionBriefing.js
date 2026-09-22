export class MissionBriefing {
  constructor(root,campaign,onStart){this.root=root;this.campaign=campaign;this.onStart=onStart;}

  show(level){
    const overlay=document.createElement('div');overlay.className='briefing-overlay';
    const inventory=Object.entries(level.inventory||{}).filter(([k,v])=>k!=='demolish'&&v>0&&Number.isFinite(v)).map(([k,v])=>'<span><b>'+v+'×</b> '+this.label(k)+'</span>').join('');
    const objectives=(level.objectives||[]).map(o=>'<li>'+this.objectiveLabel(o,level)+'</li>').join('');
    const tips=(level.tips||[]).map(t=>'<li>'+t+'</li>').join('');
    overlay.innerHTML=
      '<div class="briefing-card">'+
        '<div class="briefing-number">FASE '+String(level.number).padStart(2,'0')+'</div>'+
        '<h2>'+level.name+'</h2><p class="briefing-tag">'+level.tagline+'</p>'+
        '<p class="briefing-copy">'+level.briefing+'</p>'+
        '<div class="briefing-grid">'+
          '<section><h3>OBJETIVOS</h3><ul>'+objectives+'</ul></section>'+
          '<section><h3>RESTRIÇÕES</h3><div class="briefing-stat"><span>Orçamento</span><strong>$'+level.budget.toLocaleString('pt-BR')+'</strong></div><div class="briefing-stat"><span>Cooling</span><strong>'+(level.powerLimit/1000).toFixed(1)+' kW</strong></div><div class="briefing-stat"><span>Exterior</span><strong>'+level.environment.outdoorTemperature+'°C</strong></div><div class="briefing-stat"><span>Estabilização</span><strong>'+level.missionDuration+' s</strong></div></section>'+
        '</div>'+
        '<section class="briefing-inventory"><h3>RECURSOS DISPONÍVEIS</h3><div>'+inventory+'</div></section>'+
        '<section class="briefing-tips"><h3>NOTAS DE ENGENHARIA</h3><ul>'+tips+'</ul></section>'+
        '<div class="briefing-actions"><button class="secondary" data-back>← Campanha</button><button class="primary" data-start>INICIAR MISSÃO →</button></div>'+
      '</div>';
    overlay.querySelector('[data-back]').onclick=()=>overlay.remove();
    overlay.querySelector('[data-start]').onclick=()=>{overlay.remove();this.onStart(level);};
    this.root.append(overlay);
  }

  label(id){return ({wall:'Parede',insulation:'Isolante',copper:'Cobre',fan:'Ventilador',exhaust:'Exaustor',pipe:'Tubo',pump:'Bomba',tank:'Tanque',radiator:'Radiador',exchanger:'Trocador',sensor:'Sensor'}[id]||id);}

  objectiveLabel(o,level){
    if(o.label)return o.label;
    if(o.type==='zoneTemperature')return (level.zones.find(z=>z.id===o.zoneId)?.name||o.zoneId)+' < '+o.max+'°C';
    if(o.type==='powerBelow')return 'Potência < '+(o.max/1000)+' kW';
    if(o.type==='machineTemperature')return 'Equipamentos < '+o.max+'°C';
    return o.type;
  }
}
