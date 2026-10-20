import { openCategoryForTool } from './Toolbar.js';

const STORAGE_PREFIX='thermal-lab-tutorial-v1:';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const inZone=(zones,x,y)=>(zones||[]).some(z=>x>=z.x&&y>=z.y&&x<z.x+z.width&&y<z.y+z.height);
const ducts=world=>world.utilitySetByType?[...world.utilitySetByType('duct')]:world.allUtilities().filter(item=>item.type==='duct');
// Topology status is rebuilt on every placement, so it is valid while the simulation is still in planning.
const ventConnected=(game,vent)=>game.sim.cooling?.networkByVentId?.get(vent.id)?.status==='READY';
const aimsAtMachine=(world,vent)=>{const d=vent.direction||{x:0,y:0};return world.entities.some(entity=>entity.isHeatMachine&&Math.sign(entity.x-vent.x)*d.x+Math.sign(entity.y-vent.y)*d.y>0);};
const outdoorUnits=game=>game.world.entitiesByType('coolingUnit').filter(unit=>!inZone(game.level.zones,unit.x,unit.y));

// Step checks only read game state, so they can be evaluated every frame and tested in isolation.
export const TUTORIAL_CHECKS={
  toolSelected:(game,step)=>game.build.selected===step.tool,
  outdoorCoolingUnit:game=>outdoorUnits(game).length>0,
  indoorCoolingUnit:game=>game.world.entitiesByType('coolingUnit').some(unit=>inZone(game.level.zones,unit.x,unit.y)),
  ductIntoRoom:game=>{
    const networks=new Set(outdoorUnits(game).flatMap(unit=>String(unit.networkId||'').split(',').filter(Boolean)));
    return ducts(game.world).some(duct=>networks.has(duct.networkId)&&inZone(game.level.zones,duct.x,duct.y));
  },
  ventReady:game=>game.world.entitiesByType('supplyVent').some(vent=>ventConnected(game,vent)),
  ventAimed:game=>game.world.entitiesByType('supplyVent').some(vent=>ventConnected(game,vent)&&aimsAtMachine(game.world,vent)),
  ventMisaimed:game=>game.world.entitiesByType('supplyVent').some(vent=>!aimsAtMachine(game.world,vent)),
  entityCount:(game,step)=>game.world.entitiesByType(step.entity).length>=(step.count||1),
  operationThermal:game=>game.sim.mission.state!=='planning'&&game.renderer.mode==='thermal',
};

export function evaluateTutorialCheck(game,step,check=step.check){return Boolean(TUTORIAL_CHECKS[check]?.(game,step));}

// A step also counts as done when the next one already holds (e.g. the tool was picked and
// used between two frames, or the tutorial was restarted after building).
export function nextTutorialIndex(game,steps,index){
  while(index<steps.length&&(evaluateTutorialCheck(game,steps[index])||(steps[index+1]&&evaluateTutorialCheck(game,steps[index+1]))))index++;
  return index;
}

export class TutorialOverlay {
  constructor(game,tutorial,{root=document.querySelector('.viewport-wrap'),storage=null}={}){
    this.game=game;this.tutorial=tutorial;this.steps=tutorial.steps||[];this.root=root;this.index=0;this.finished=false;this.highlighted=[];this.preparedIndex=-1;
    if(!storage){try{storage=globalThis.localStorage;}catch{storage=null;}}
    this.storage=storage;this.key=STORAGE_PREFIX+(game.level.id||'level');
    this.card=document.createElement('section');this.card.className='tutorial-card';this.card.setAttribute('aria-live','polite');this.card.setAttribute('aria-label','Tutorial');
    this.card.addEventListener('click',event=>{
      if(event.target.closest('[data-tutorial-skip]'))this.close('skipped');
      if(event.target.closest('[data-tutorial-close]'))this.close('done');
    });
    this.active=this.readState()==null;
    if(this.active)this.mount();
  }

  readState(){try{return this.storage?.getItem(this.key)??null;}catch{return null;}}
  writeState(value){try{if(value==null)this.storage?.removeItem(this.key);else this.storage?.setItem(this.key,value);}catch{}}

  mount(){if(this.root&&!this.card.isConnected)this.root.appendChild(this.card);this.render();}

  restart(){this.writeState(null);this.index=0;this.finished=false;this.active=true;this.preparedIndex=-1;this.mount();}

  close(state){
    this.writeState(state);this.active=false;this.clearHighlights();this.game.renderer.tutorialArea=null;this.card.remove();
  }

  get step(){return this.steps[this.index]||null;}

  update(){
    if(!this.active||this.finished)return;
    const next=nextTutorialIndex(this.game,this.steps,this.index),advanced=next!==this.index;this.index=next;
    if(!this.step){this.finish();return;}
    if(this.preparedIndex!==this.index)this.prepareStep();
    this.applyHighlights();this.dock();
    const warning=this.step.warning&&evaluateTutorialCheck(this.game,this.step,this.step.warning.check)?this.step.warning.text:'';
    if(advanced||warning!==this.warning){this.warning=warning;this.render();}
  }

  prepareStep(){
    const step=this.step;this.preparedIndex=this.index;
    if(step.openTool){const toolbar=this.game.ui?.toolbar;if(toolbar){openCategoryForTool(this.game.build.catalog,step.openTool,toolbar.openCategories);toolbar.renderGroups();}}
    this.game.renderer.tutorialArea=step.area||null;
    if(step.area)this.game.focusArea?.(step.area);
  }

  // Keeps the card in the viewport quadrant opposite to the highlighted area.
  dock(){
    const area=this.step?.area,{camera,renderer}=this.game,width=this.root?.clientWidth||0,height=this.root?.clientHeight||0;
    let vertical='top',horizontal='left';
    if(area&&width&&height){
      const t=renderer.tile,cx=((area.x+area.width/2)*t-camera.x)*camera.zoom,cy=((area.y+area.height/2)*t-camera.y)*camera.zoom;
      if(cy<height*.5)vertical='bottom';
      if(cx<width*.5)horizontal='right';
    }
    const dock=vertical+' '+horizontal;
    if(this.card.dataset.dock!==dock)this.card.dataset.dock=dock;
  }

  // Highlights are re-applied every frame because the toolbar re-renders its buttons.
  applyHighlights(){
    const phase=this.game.sim.mission.state==='planning'?'planning':'running';
    const selectors=(this.step?.highlight||[]).map(item=>typeof item==='string'?{selector:item}:item).filter(item=>!item.phase||item.phase===phase).map(item=>item.selector);
    const targets=selectors.flatMap(selector=>[...document.querySelectorAll(selector)]);
    for(const element of this.highlighted)if(!targets.includes(element))element.classList.remove('tutorial-target');
    for(const element of targets)element.classList.add('tutorial-target');
    this.highlighted=targets;
  }
  clearHighlights(){for(const element of this.highlighted)element.classList.remove('tutorial-target');this.highlighted=[];}

  finish(){
    this.finished=true;this.clearHighlights();this.game.renderer.tutorialArea=null;this.writeState('done');
    const done=this.tutorial.complete||{};
    this.card.classList.add('complete');this.card.dataset.dock='bottom left';
    this.card.innerHTML='<header><span>TUTORIAL CONCLUÍDO</span></header><h3>'+escapeHtml(done.title||'Pronto para operar')+'</h3><p>'+escapeHtml(done.text||'Mantenha os objetivos estáveis até o fim da missão.')+'</p><footer><button type="button" class="primary" data-tutorial-close>Entendi</button></footer>';
  }

  render(){
    const step=this.step;if(!step||this.finished)return;
    const total=this.steps.length,dots=this.steps.map((_,i)=>'<i class="'+(i<this.index?'done':i===this.index?'current':'')+'"></i>').join('');
    this.card.classList.remove('complete');
    this.card.innerHTML='<header><span>TUTORIAL · PASSO '+(this.index+1)+'/'+total+'</span><button type="button" data-tutorial-skip>Pular tutorial</button></header>'+
      '<h3>'+escapeHtml(step.title)+'</h3><p>'+escapeHtml(step.text)+'</p>'+
      (this.warning?'<p class="tutorial-warning">'+escapeHtml(this.warning)+'</p>':'')+
      '<div class="tutorial-dots" aria-hidden="true">'+dots+'</div>';
    this.card.classList.remove('step-in');void this.card.offsetWidth;this.card.classList.add('step-in');
  }
}
