import { FirstPersonController } from './controllers/FirstPersonController.js';
import { ThreeRenderer } from './ThreeRenderer.js';

const OVERLAYS=['normal','thermal','airflow','power','cooling','water','alarms','contracts'];
const OVERLAY_LABELS={normal:'Normal',thermal:'Térmica',airflow:'Airflow',power:'Energia',cooling:'Refrigeração',water:'Água',alarms:'Alertas',contracts:'Contratos'};

export class ThreeView {
  constructor(host,{world,simulation,datacenter,snapshot=null,quality='medium',onSelect=()=>{},onMessage=()=>{}}={}){
    this.host=host;this.world=world;this.simulation=simulation;this.datacenter=datacenter;this.snapshot=snapshot;this.quality=quality;this.onSelect=onSelect;this.onMessage=onMessage;
    this.mode='walk';this.overlay='normal';this.renderer=null;this.controller=null;this.hud=null;this.status=null;this.selection=null;this.disposed=false;this.elapsed=0;this.frameSamples=0;this.lastFps=60;this.slowIntervals=0;this.fastIntervals=0;
    this.resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>this.resize()):null;
    this.create();
  }
  create(){
    try{
    this.renderer=new ThreeRenderer({quality:this.quality});this.renderer.domElement.className='three-view-canvas';this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','Visualização 3D do data center');this.host.append(this.renderer.domElement);
    this.buildHud();this.setMode('walk');this.resizeObserver?.observe(this.host);this.resize();
      this.canvasClick=()=>{if(this.mode==='walk'&&!this.controller?.controls.isLocked)this.controller?.controls.lock();};
      this.keydown=e=>{if(this.mode!=='walk'||e.code!=='KeyE')return;const hit=this.renderer.pickCenter();if(hit)this.select(hit);};
      this.statsKeydown=e=>{if(e.code==='F3'){e.preventDefault();this.hud?.querySelector('[data-three-stats]')?.click();}};
      this.renderer.domElement.addEventListener('click',this.canvasClick);window.addEventListener('keydown',this.keydown);window.addEventListener('keydown',this.statsKeydown);
    }catch(error){
      this.error=error;this.host.classList.add('three-view-unavailable');this.status=document.createElement('div');this.status.className='three-unavailable';this.status.innerHTML='<strong>Visualização 3D indisponível</strong><span>Este navegador não conseguiu iniciar o WebGL. A simulação 2D continua disponível.</span>';this.host.append(this.status);this.onMessage('Não foi possível iniciar o WebGL: '+error.message);
    }
  }
  buildHud(){
    this.hud=document.createElement('div');this.hud.className='three-hud';this.hud.innerHTML='<div class="three-layer-tools" role="toolbar" aria-label="Camadas 3D"></div><div class="three-hud-status"><label>QUALIDADE <select aria-label="Qualidade gráfica"><option value="low">Baixa</option><option value="medium" selected>Média</option><option value="high">Alta</option><option value="ultra">Ultra</option></select></label><button type="button" data-three-stats aria-pressed="false">F3 · Dados</button></div><div class="three-hint" aria-live="polite"></div><div class="three-crosshair" aria-hidden="true">+</div><button type="button" class="three-inspect-card" hidden aria-label="Inspecionar equipamento"></button><section class="three-equipment-panel" hidden aria-live="polite" aria-label="Dados do equipamento selecionado"></section><pre class="three-stats" hidden aria-live="polite"></pre>';
    const tools=this.hud.querySelector('.three-layer-tools');
    for(const mode of OVERLAYS){const button=document.createElement('button');button.type='button';button.dataset.threeOverlay=mode;button.textContent=OVERLAY_LABELS[mode];button.setAttribute('aria-pressed',String(mode===this.overlay));button.addEventListener('click',()=>this.setOverlay(mode));tools.append(button);}
    this.hint=this.hud.querySelector('.three-hint');this.inspectCard=this.hud.querySelector('.three-inspect-card');this.equipmentPanel=this.hud.querySelector('.three-equipment-panel');this.inspectCard.addEventListener('click',()=>{if(this.hoverRecord)this.select(this.hoverRecord);});this.host.append(this.hud);
    this.qualitySelect=this.hud.querySelector('select');this.qualitySelect.value=this.quality;this.qualitySelect.addEventListener('change',()=>{this.renderer.setQuality(this.qualitySelect.value);this.quality=this.qualitySelect.value;});
    this.statsNode=this.hud.querySelector('.three-stats');this.hud.querySelector('[data-three-stats]').addEventListener('click',event=>{const shown=this.statsNode.hidden;this.statsNode.hidden=!shown;event.currentTarget.setAttribute('aria-pressed',String(shown));});
  }
  setMode(mode){
    if(!this.renderer)return;
    this.controller?.dispose();this.controller=new FirstPersonController(this.renderer.camera,this.renderer.domElement);this.controller.onUnlock=()=>{if(this.hint)this.hint.textContent='Passeio pausado · clique na cena para continuar';};
    this.mode='walk';this.controller.enter(this.world,this.snapshot);this.renderer.worldBuilder.setCeilingVisible(true);
    this.hint&&(this.hint.textContent='WASD para andar · mouse para olhar · clique captura o mouse · Esc libera');
    this.hud?.classList.add('walk-mode');
    this.updateHud();
  }
  setOverlay(mode){this.overlay=OVERLAYS.includes(mode)?mode:'normal';this.renderer?.setOverlay(this.overlay);for(const button of this.hud?.querySelectorAll('[data-three-overlay]')||[]){const active=button.dataset.threeOverlay===this.overlay;button.setAttribute('aria-pressed',String(active));button.classList.toggle('active',active);}}
  setVisible(visible){if(!visible){this.controller?.controls?.unlock();this.controller?.keys?.clear();}if(this.renderer)this.renderer.domElement.style.display=visible?'block':'none';if(this.hud)this.hud.style.display=visible?'':'none';if(visible)this.resize();}
  update(snapshot,dt=0){this.snapshot=snapshot;if(this.selection){this.selection=snapshot.equipment.find(record=>record.id===this.selection.id)||null;}if(!this.renderer)return;this.renderer.render(snapshot,{overlay:this.overlay,ceiling:this.mode==='walk',dt:this.simulation?.paused?0:dt});this.controller?.update?.(dt);this.updateHud();this.updatePerformance(dt);}
  updatePerformance(dt){
    this.elapsed+=Math.max(0,dt);this.frameSamples++;
    if(this.elapsed>=5){
      const fps=this.frameSamples/this.elapsed;this.frameSamples=0;this.elapsed=0;this.lastFps=fps;
      if(fps<40){this.slowIntervals=(this.slowIntervals||0)+1;this.fastIntervals=0;if(this.slowIntervals>=1)this.stepQuality(-1);}
      else if(fps>56){this.fastIntervals=(this.fastIntervals||0)+1;this.slowIntervals=0;if(this.fastIntervals>=2)this.stepQuality(1);}
      else{this.slowIntervals=0;this.fastIntervals=0;}
    }
    if(!this.statsNode?.hidden){const info=this.renderer.adapter.info;this.statsNode.textContent=`FPS ${Number(this.lastFps||0).toFixed(0)}\nRender ${Math.round(1000/Math.max(1,this.lastFps||60))} ms\nChamadas ${info.render.calls}\nTriângulos ${info.render.triangles.toLocaleString('pt-BR')}\nEquipamentos ${this.snapshot?.equipment.length||0}`;}
  }
  stepQuality(delta){const presets=['low','medium','high','ultra'],index=presets.indexOf(this.quality),next=presets[Math.max(0,Math.min(presets.length-1,index+delta))];if(next===this.quality)return;this.quality=next;this.qualitySelect.value=next;this.renderer.setQuality(next);this.onMessage('Qualidade gráfica ajustada para '+({low:'baixa',medium:'média',high:'alta',ultra:'ultra'}[next])+'.');}
  select(record){this.selection=record;this.onSelect(record?.runtimeId??record?.id,record);this.updateHud();}
  updateHud(){
    if(!this.hint||!this.inspectCard)return;
    const record=this.renderer?.pickCenter();
    this.hoverRecord=record;
    this.inspectCard.hidden=!record;
    if(record){const temp=Number(record.inletAirTemperature??record.temperature??0).toFixed(1),power=Number(record.powerKW||0).toFixed(1);this.inspectCard.textContent=`${record.name||record.specialization?.toUpperCase()||record.type} · ${temp} °C · ${power} kW · E inspeciona`;}
    if(this.selection){this.equipmentPanel.hidden=false;this.equipmentPanel.innerHTML=this.inspectorMarkup(this.selection);}else this.equipmentPanel.hidden=true;
  }
  inspectorMarkup(record){
    const rows=[['ID',record.id],['Tipo',record.type],['Estado',({running:'Operando',off:'Desligado',blocked:'Sem energia',disconnected:'Desconectado',alarm:'Alerta'})[record.status]||record.status]];
    if(record.type==='computeRack'||record.type==='serverRack'){rows.push(['Temperatura de entrada',`${Number(record.inletAirTemperature).toFixed(1)} °C`],['Utilização',`${Math.round(record.occupancy*100)}%`],['Potência',`${Number(record.powerKW).toFixed(1)} / ${Number(record.ratedPowerKW||record.powerKW).toFixed(1)} kW`],['Contratos',record.contractNames.length?record.contractNames.join(', '):'Nenhum'],['Airflow',`${Number(record.airflow).toFixed(2)} m³/s`]);}
    else if(record.type==='coolingUnit'){rows.push(['Insuflação',`${Number(record.supplyTemperature).toFixed(1)} °C`],['Retorno',`${Number(record.returnTemperature).toFixed(1)} °C`],['Capacidade disponível',`${Number(record.availableCapacityKW).toFixed(1)} kW`],['Remoção atual',`${Number(record.coolingLoadKW).toFixed(1)} kW`],['Vazão',`${Number(record.currentAirFlow).toFixed(2)} m³/s`]);}
    else{rows.push(['Temperatura',`${Number(record.temperature).toFixed(1)} °C`],['Potência',`${Number(record.powerKW).toFixed(1)} kW`],['Vazão',`${Number(record.flowRate).toFixed(2)}`]);}
    if(this.snapshot?.metrics.alertEquipmentIds?.includes(String(record.id)))rows.push(['Alerta','Violação de contrato / SLA']);
    return `<strong>${record.name||record.specialization?.toUpperCase()||record.type}</strong><dl>${rows.map(([key,value])=>`<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  }
  select(record){this.selection=record;this.onSelect(record?.runtimeId??record?.id,record);this.updateHud();}
  resize(){this.renderer?.resize();}
  getChecksum(){return this.renderer?.checksum()||{equipmentIds:[],meshIds:[]};}
  dispose(){if(this.disposed)return;this.disposed=true;this.resizeObserver?.disconnect();this.controller?.dispose();if(this.renderer){this.renderer.domElement.removeEventListener('click',this.canvasClick);window.removeEventListener('keydown',this.keydown);window.removeEventListener('keydown',this.statsKeydown);this.renderer.dispose();this.renderer.domElement.remove();}this.hud?.remove();this.status?.remove();}
}
