import { BUILD_CATALOG } from '../building/BuildCatalog.js';
export class Toolbar {
  constructor(root,buildSystem){this.root=root;this.build=buildSystem;this.render();}
  render(){this.root.innerHTML='';const inspect=document.createElement('button');inspect.className=`tool ${this.build.selected===null?'active':''}`;inspect.innerHTML='<span>⌖</span><b>Inspecionar</b><small>Esc / RMB</small>';inspect.onclick=()=>this.build.select(null);this.root.append(inspect);
    for(const [id,c] of Object.entries(BUILD_CATALOG)){const b=document.createElement('button'),count=this.build.inventory[id];b.className=`tool ${this.build.selected===id?'active':''}`;const inv=Number.isFinite(count)?`×${count}`:'∞';b.disabled=id!=='demolish'&&!this.build.canAfford(id);b.innerHTML=`<span>${c.icon}</span><b>${c.label}</b><small>$${c.cost} · ${inv}</small>`;b.onclick=()=>this.build.select(id);this.root.append(b);} }
}
