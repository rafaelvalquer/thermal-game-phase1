import { Material } from './Material.js';

const defs = [
  { id:'air', name:'Ar', density:1.225, heatCapacity:1005, conductivity:0.025, color:'#1f2937', solid:false },
  { id:'water', name:'Água', density:997, heatCapacity:4186, conductivity:0.6, color:'#2563eb', solid:false },
  { id:'concrete', name:'Concreto', density:2400, heatCapacity:880, conductivity:1.7, color:'#71717a', solid:true },
  { id:'wood', name:'Madeira', density:700, heatCapacity:1700, conductivity:0.12, color:'#9a6b3f', solid:true },
  { id:'steel', name:'Aço', density:7850, heatCapacity:490, conductivity:45, color:'#94a3b8', solid:true },
  { id:'copper', name:'Cobre', density:8960, heatCapacity:385, conductivity:401, color:'#b86132', solid:true },
  { id:'insulation', name:'Isolante', density:30, heatCapacity:1400, conductivity:0.03, color:'#d8c985', solid:true },
];

export class MaterialRegistry {
  constructor() {
    this.materials = new Map(defs.map((d) => [d.id, new Material(d)]));
    this.ids = defs.map((d) => d.id);
    this.idToIndex = new Map(this.ids.map((id, i) => [id, i]));
  }
  get(id) { return this.materials.get(id); }
  index(id) { return this.idToIndex.get(id); }
  fromIndex(index) { return this.get(this.ids[index]); }
}
