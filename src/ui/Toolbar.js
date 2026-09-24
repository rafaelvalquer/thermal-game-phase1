import { BUILD_CATALOG } from '../building/BuildCatalog.js';

const SPRITE_ICONS={fan:'airflow/fan.svg',exhaust:'airflow/exhaust.svg',pump:'fluid/pump.svg',tank:'fluid/tank.svg',radiator:'fluid/radiator.svg',exchanger:'fluid/heat_exchanger.svg',sensor:'sensors/sensor.svg'};
const COOLING_MODELS={compact:{label:'Compacta',cost:4000},commercial:{label:'Comercial',cost:8000},industrial:{label:'Industrial',cost:14000}};
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function groupToolbarTools(catalog,query=''){
  const groups=[];
  for(const [id,tool] of Object.entries(catalog||BUILD_CATALOG)){
    let group=groups.find(item=>item.category===tool.category);
    if(!group){group={category:tool.category,tools:[]};groups.push(group);}
    group.tools.push({id,...tool});
  }
  const term=normalize(query);
  if(!term)return groups;
  return groups.map(group=>({...group,tools:group.tools.filter(tool=>normalize(`${group.category} ${tool.id} ${tool.label} ${tool.description}`).includes(term))})).filter(group=>group.tools.length);
}

export function openCategoryForTool(catalog,toolId,openCategories){
  const category=catalog?.[toolId]?.category;
  if(category)openCategories.add(category);
}

export function isToolbarCategoryOpen(category,query,openCategories){
  return Boolean(normalize(query)||openCategories.has(category));
}

export function toggleToolbarCategory(category,openCategories){
  if(openCategories.has(category)){openCategories.delete(category);return false;}
  openCategories.add(category);return true;
}

export function clearToolbarSearch(input){
  if(!input.value)return false;
  input.value='';return true;
}

export class Toolbar {
  constructor(root,buildSystem){
    this.root=root;this.build=buildSystem;this.query='';this.openCategories=new Set();this.lastSelected=buildSystem.selected;
    this.root.innerHTML='<div class="toolbox"><label class="tool-search"><span aria-hidden="true">⌕</span><input type="search" data-tool-search placeholder="Buscar ferramenta…" aria-label="Buscar ferramenta por nome, descrição ou categoria"><kbd>ESC</kbd></label><div class="tool-search-status" data-tool-search-status aria-live="polite"></div><button type="button" class="tool tool-inspect" data-inspect></button><div class="tool-groups" data-tool-groups></div></div>';
    this.search=this.root.querySelector('[data-tool-search]');this.groupsRoot=this.root.querySelector('[data-tool-groups]');
    this.search.addEventListener('input',()=>{this.query=this.search.value;this.renderGroups();});
    this.search.addEventListener('keydown',event=>{if(event.key==='Escape'&&clearToolbarSearch(this.search)){event.preventDefault();event.stopPropagation();this.query='';this.renderGroups();}});
    this.root.addEventListener('click',event=>this.handleClick(event));
    this.render();
  }

  render(){
    const selected=this.build.selected;
    if(selected!==this.lastSelected){
      openCategoryForTool(this.build.catalog,selected,this.openCategories);
      this.lastSelected=selected;
    }
    const inspect=this.root.querySelector('[data-inspect]');
    inspect.className='tool tool-inspect '+(selected===null?'active':'');
    inspect.innerHTML='<span class="tool-icon">⌖</span><span class="tool-main"><b>Inspecionar</b><small>Selecionar tile ou equipamento</small></span><span class="tool-meta">Esc / RMB</span>';
    inspect.title='Inspecionar o estado físico de tiles e equipamentos.';
    inspect.setAttribute('aria-pressed',String(selected===null));
    this.renderGroups();
  }

  renderGroups(){
    const focused=this.root.ownerDocument?.activeElement;
    const focusedCategory=focused?.dataset?.category;
    const focusedTool=focused?.dataset?.tool;
    const groups=groupToolbarTools(this.build.catalog||BUILD_CATALOG,this.query),term=normalize(this.query);
    if(!groups.length){
      this.groupsRoot.innerHTML='<p class="tool-empty">Nenhuma ferramenta encontrada.<small>Tente outro nome ou categoria.</small></p>';
      this.root.querySelector('[data-tool-search-status]').textContent='0 resultados';
      return;
    }
    this.groupsRoot.innerHTML=groups.map((group,index)=>{
      const open=isToolbarCategoryOpen(group.category,this.query,this.openCategories),listId='tool-group-'+index;
      const items=group.tools.map(tool=>{
        const inventory=this.build.inventory[tool.id],stock=Number.isFinite(inventory)?'×'+inventory:'∞';
        const model=tool.id==='coolingUnit'?COOLING_MODELS[this.build.coolingUnitModel]:null;
        const cost=model?.cost??tool.cost,description=tool.description+(model?' Modelo '+model.label+'; pressione M para alternar.':'')+(tool.power?' Consumo: '+tool.power+'.':'');
        const sprite=SPRITE_ICONS[tool.id],active=this.build.selected===tool.id,disabled=tool.id!=='demolish'&&!this.build.canAfford(tool.id);
        return '<button type="button" class="tool tool-compact '+(active?'active':'')+'" data-tool="'+escapeHtml(tool.id)+'" title="'+escapeHtml(description)+'" aria-pressed="'+active+'" '+(disabled?'disabled':'')+'><span class="tool-icon '+(sprite?'tool-icon-sprite':'')+'" '+(sprite?'style="--tool-sprite:url(/assets/sprites/'+escapeHtml(sprite)+')"':'')+'>'+ (sprite?'':escapeHtml(tool.icon)) +'</span><span class="tool-main"><b>'+escapeHtml(tool.label)+'</b></span><span class="tool-meta"><em>$'+Number(cost||0).toLocaleString('pt-BR')+'</em><i>'+stock+(tool.power?' · '+escapeHtml(tool.power):'')+'</i></span></button>';
      }).join('');
      return '<section class="tool-group '+(open?'open':'')+'"><button type="button" class="tool-category" data-category="'+escapeHtml(group.category)+'" aria-expanded="'+open+'" aria-controls="'+listId+'"><span>'+escapeHtml(group.category)+'</span><span class="tool-category-count">'+group.tools.length+'</span><span class="tool-category-chevron" aria-hidden="true">⌄</span></button><div class="tool-category-items" id="'+listId+'" '+(open?'':'hidden')+'>'+items+'</div></section>';
    }).join('');
    const count=groups.reduce((sum,group)=>sum+group.tools.length,0);
    this.root.querySelector('[data-tool-search-status]').textContent=term?count+' ferramenta'+(count===1?'':'s')+' encontrada'+(count===1?'':'s'):'';
    if(focusedCategory!==undefined){
      [...this.groupsRoot.querySelectorAll('[data-category]')].find(button=>button.dataset.category===focusedCategory)?.focus();
    }else if(focusedTool!==undefined){
      [...this.groupsRoot.querySelectorAll('[data-tool]')].find(button=>button.dataset.tool===focusedTool)?.focus();
    }
  }

  handleClick(event){
    const categoryButton=event.target.closest?.('[data-category]');
    if(categoryButton){
      const category=categoryButton.dataset.category;
      toggleToolbarCategory(category,this.openCategories);
      this.renderGroups();return;
    }
    const toolButton=event.target.closest?.('[data-tool]');
    if(toolButton&&!toolButton.disabled)this.build.select(toolButton.dataset.tool);
    if(event.target.closest?.('[data-inspect]'))this.build.select(null);
  }
}
