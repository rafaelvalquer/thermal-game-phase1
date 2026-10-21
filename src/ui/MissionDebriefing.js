import { rateMission } from '../campaign/StarRating.js';
import { diagnoseMission } from '../campaign/MissionDiagnosis.js';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const temperatureLimit=level=>{
  const limits=(level.objectives||[]).filter(o=>['machineTemperature','zoneTemperature','maxAirTemperature'].includes(o.type)).map(o=>o.max);
  return limits.length?Math.min(...limits):null;
};

export function missionResult(game){
  const sim=game.sim;
  return {
    cost:game.level.budget-game.build.budget,
    maxPower:sim.metrics.maxPowerEver,
    maxTemperature:sim.metrics.maxTempEver,
    thermalMargin:sim.mission.minThermalMargin,
    completionTime:sim.elapsed,
    externalEnergy:sim.metrics.externalEnergy,
  };
}

export class MissionDebriefing {
  constructor(game,campaign,onCampaign,onStartLevel){this.game=game;this.campaign=campaign;this.onCampaign=onCampaign;this.onStartLevel=onStartLevel;this.shown=false;}

  show(){
    if(this.shown)return;this.shown=true;
    const game=this.game,sim=game.sim,level=game.level,won=sim.mission.state==='won',modal=document.querySelector('#endModal');
    if(!modal)return;
    const result=missionResult(game),rating=rateMission(level,result,won);result.stars=rating.stars;
    const campaignLevel=level.campaign!==false;
    const previous=campaignLevel?this.campaign.state.bestResults[level.id]?.stars||0:0;
    if(won&&campaignLevel)this.campaign.completeLevel(level,result);
    const failure=sim.mission.failure,hints=diagnoseMission({sim,level});
    const starHint=won?rating.criteria.filter(item=>!item.ok).map(item=>({title:'Para a próxima estrela',text:item.label+' · '+item.detail})):[];
    const tips=[...hints,...starHint].slice(0,3);
    const stars=rating.criteria.map((item,index)=>'<span class="debrief-star '+(item.ok?'on':'')+'" style="--s:'+index+'" aria-hidden="true">★</span>').join('');
    const criteria=rating.criteria.map(item=>'<li class="'+(item.ok?'ok':'')+'"><i>'+(item.ok?'✓':'✕')+'</i><span>'+escapeHtml(item.label)+'<small>'+escapeHtml(item.detail)+'</small></span></li>').join('');
    const where=failure?'<div class="debrief-failure"><b>ONDE FALHOU</b><span>'+escapeHtml(failure.entityName||failure.zoneName||'Instalação')+(failure.x!=null?' · posição ('+failure.x+', '+failure.y+')':'')+' · aos '+Math.round(failure.time||sim.elapsed)+' s</span>'+(failure.x!=null?'<button type="button" data-locate>Ver no mapa</button>':'')+'</div>':'';
    modal.innerHTML='<div class="end-card debrief-card '+(won?'won':'failed')+'" role="dialog" aria-modal="true" aria-labelledby="debriefTitle"><span>THERMAL LAB · FASE '+String(level.number).padStart(2,'0')+'</span><h2 id="debriefTitle">'+(won?'MISSÃO CONCLUÍDA':'FALHA TÉRMICA')+'</h2>'+
      (won?'<div class="debrief-stars" role="img" aria-label="'+rating.stars+' de 3 estrelas">'+stars+'</div>'+(rating.stars>previous&&previous>0?'<p class="debrief-record">Novo recorde de estrelas!</p>':''):'<p>'+escapeHtml(sim.mission.failReason)+'</p>')+
      where+
      '<div class="debrief-chart"><div class="debrief-chart-head"><span>TEMPERATURA DURANTE A MISSÃO</span><small><i class="max-dot"></i> máx <i class="avg-dot"></i> média <i class="safe-dot"></i> limite</small></div><canvas aria-label="Gráfico de temperatura da missão"></canvas></div>'+
      '<div class="debrief-grid"><div><small>Temperatura máxima</small><strong>'+result.maxTemperature.toFixed(1)+'°C</strong></div><div><small>Potência máxima</small><strong>'+(result.maxPower/1000).toFixed(2)+' kW</strong></div><div><small>Custo instalado</small><strong>$'+Math.round(result.cost).toLocaleString('pt-BR')+'</strong></div><div><small>Tempo</small><strong>'+Math.round(result.completionTime)+' s</strong></div></div>'+
      (campaignLevel&&won?'<ul class="debrief-criteria">'+criteria+'</ul>':'')+
      (tips.length?'<div class="debrief-tips">'+tips.map(tip=>'<div><b>'+escapeHtml(tip.title)+'</b><p>'+escapeHtml(tip.text)+'</p></div>').join('')+'</div>':'')+
      '<div class="end-actions"><button data-campaign>← Voltar à campanha</button>'+(won&&campaignLevel&&level.number<this.campaign.levels.length?'<button class="primary" data-next>Próxima fase</button>':'')+'<button data-restart>↻ Repetir fase</button></div></div>';
    modal.querySelector('[data-campaign]').onclick=()=>this.onCampaign();
    modal.querySelector('[data-restart]').onclick=()=>this.onStartLevel(level);
    modal.querySelector('[data-next]')?.addEventListener('click',()=>window.__thermalShowBriefing?.(this.campaign.getLevel(level.number+1)));
    modal.querySelector('[data-locate]')?.addEventListener('click',()=>this.locateFailure(failure));
    modal.classList.add('show');
    this.drawChart(modal.querySelector('.debrief-chart canvas'),failure);
  }

  // Hides the report and points the camera at the failure; a floating button brings the report back.
  locateFailure(failure){
    const modal=document.querySelector('#endModal'),game=this.game;if(!modal||failure?.x==null)return;
    modal.classList.remove('show');
    const entity=failure.entityId!=null?game.world.getEntityById(failure.entityId):null;
    game.renderer.tutorialArea={x:failure.x-2,y:failure.y-2,width:5,height:5,label:'FALHA AQUI'};
    if(entity)game.focusThermalEntity(entity);else game.focusArea({x:failure.x-4,y:failure.y-4,width:9,height:9});
    const back=document.createElement('button');back.type='button';back.className='debrief-return';back.textContent='↩ Voltar ao relatório';
    back.onclick=()=>{back.remove();game.renderer.tutorialArea=null;modal.classList.add('show');};
    document.querySelector('.viewport-wrap')?.appendChild(back);back.focus();
  }

  drawChart(canvas,failure){
    if(!canvas?.getContext)return;
    const history=this.game.sim.missionHistory?.length?this.game.sim.missionHistory:this.game.sim.history,rect=canvas.getBoundingClientRect(),dpr=Math.min(2,globalThis.devicePixelRatio||1),W=Math.max(10,rect.width),H=Math.max(10,rect.height);
    canvas.width=Math.floor(W*dpr);canvas.height=Math.floor(H*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);ctx.strokeStyle='rgba(148,163,184,.14)';ctx.lineWidth=1;
    for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,H*i/4);ctx.lineTo(W,H*i/4);ctx.stroke();}
    if(history.length<2){ctx.fillStyle='#a3b1b0';ctx.font='11px system-ui';ctx.fillText('Sem dados suficientes',8,H/2);return;}
    const limit=temperatureLimit(this.game.level),values=history.flatMap(item=>[item.max,item.avg]).concat(limit??[]),min=Math.floor(Math.min(...values)-2),max=Math.ceil(Math.max(...values,limit??0)+2);
    const t0=history[0].t,t1=history.at(-1).t||1,x=t=>(t-t0)/Math.max(1,t1-t0)*W,y=v=>H-(Math.min(max,v)-min)/(max-min)*H;
    const line=(key,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();history.forEach((item,i)=>{const px=x(item.t),py=y(item[key]);i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();};
    if(limit!=null){ctx.strokeStyle='rgba(250,204,21,.6)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(0,y(limit));ctx.lineTo(W,y(limit));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(250,204,21,.85)';ctx.font='9px ui-monospace,monospace';ctx.fillText(limit+'°C',4,y(limit)-3);}
    line('avg','#67e8f9',1.5);line('max','#fb7185',2);
    if(failure?.time!=null){const fx=Math.min(W-1,x(failure.time));ctx.strokeStyle='#fb7185';ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(fx,0);ctx.lineTo(fx,H);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#fecaca';ctx.font='9px ui-monospace,monospace';ctx.textAlign='right';ctx.fillText('FALHA',fx-3,10);ctx.textAlign='left';}
    ctx.fillStyle='#a3b1b0';ctx.font='9px ui-monospace,monospace';ctx.fillText(max+'°C',W-34,10);ctx.fillText(Math.round(t1)+' s',W-30,H-3);
  }
}
