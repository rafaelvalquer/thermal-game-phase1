import { BUILD_CATALOG } from '../building/BuildCatalog.js';

export class Toolbar {
  constructor(root,buildSystem){this.root=root;this.build=buildSystem;this.render();}

  render(){
    this.root.innerHTML='';
    const inspect=document.createElement('button');
    inspect.className='tool tool-inspect '+(this.build.selected===null?'active':'');
    inspect.innerHTML='<span class="tool-icon">⌖</span><span class="tool-main"><b>Inspecionar</b><small>Selecionar tile ou equipamento</small></span><span class="tool-meta">Esc / RMB</span>';
    inspect.title='Inspecionar o estado físico de tiles e equipamentos.';
    inspect.onclick=()=>this.build.select(null);
    this.root.append(inspect);

    let lastCategory='';
    for(const [id,c] of Object.entries(BUILD_CATALOG)){
      if(c.category!==lastCategory){
        const heading=document.createElement('div');heading.className='tool-category';heading.textContent=c.category;this.root.append(heading);lastCategory=c.category;
      }
      const b=document.createElement('button'),count=this.build.inventory[id],inv=Number.isFinite(count)?'×'+count:'∞';
      b.className='tool '+(this.build.selected===id?'active':'');
      b.disabled=id!=='demolish'&&!this.build.canAfford(id);
      b.title=c.description+(c.power?' Consumo: '+c.power+'.':'');
      b.innerHTML='<span class="tool-icon">'+c.icon+'</span><span class="tool-main"><b>'+c.label+'</b><small>'+c.description+'</small></span><span class="tool-meta"><em>$'+c.cost+'</em><i>'+inv+(c.power?' · '+c.power:'')+'</i></span>';
      b.onclick=()=>this.build.select(id);
      this.root.append(b);
    }
  }
}
