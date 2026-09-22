import { BUILD_CATALOG } from './BuildCatalog.js';
import { PlacementValidator } from './PlacementValidator.js';
import { Fan, ExhaustFan, Pipe, Pump, WaterTank, Radiator, HeatExchanger, TemperatureSensor } from '../entities/index.js';
import { DEFAULT_BUDGET } from '../utils/Constants.js';

const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
export class BuildSystem {
  constructor(world,simulation){
    this.world=world;this.simulation=simulation;this.validator=new PlacementValidator(world);this.selected=null;this.rotation=0;this.budget=DEFAULT_BUDGET;
    this.inventory=Object.fromEntries(Object.entries(BUILD_CATALOG).map(([k,v])=>[k,v.inventory]));
    this.onChange=()=>{};
  }
  select(tool){this.selected=tool;this.onChange();}
  rotate(){this.rotation=(this.rotation+1)%4;this.onChange();}
  direction(){return DIRS[this.rotation];}
  canAfford(tool){const c=BUILD_CATALOG[tool];return c&&this.budget>=c.cost&&this.inventory[tool]>0;}
  place(x,y){
    const tool=this.selected;if(!tool||!this.validator.canPlace(tool,x,y))return {ok:false,reason:'Posição inválida'};
    if(tool==='demolish') return this.demolish(x,y);
    if(!this.canAfford(tool))return {ok:false,reason:'Sem orçamento ou estoque'};
    const before=this.simulation.totalInternalEnergy(); const c=BUILD_CATALOG[tool]; let entity=null;
    if(c.kind==='material') this.world.setMaterial(x,y,c.material);
    else {
      const dir=this.direction();
      if(tool==='fan')entity=new Fan(x,y,{...dir});
      if(tool==='exhaust')entity=new ExhaustFan(x,y,{...dir});
      if(tool==='pipe')entity=new Pipe(x,y);
      if(tool==='pump')entity=new Pump(x,y);
      if(tool==='tank')entity=new WaterTank(x,y);
      if(tool==='radiator')entity=new Radiator(x,y);
      if(tool==='exchanger')entity=new HeatExchanger(x,y);
      if(tool==='sensor')entity=new TemperatureSensor(x,y);
      if(entity)this.world.addEntity(entity);
    }
    this.budget-=c.cost;if(Number.isFinite(this.inventory[tool]))this.inventory[tool]--;
    this.simulation.registerConstruction(before);this.onChange();return {ok:true,entity};
  }
  demolish(x,y){
    const before=this.simulation.totalInternalEnergy(); const e=this.world.entityAt(x,y);
    if(e && e.type!=='machine') this.world.removeEntity(e);
    else if(!this.world.isAir(x,y)) this.world.setMaterial(x,y,'air');
    else return {ok:false,reason:'Nada removível'};
    this.simulation.registerConstruction(before);this.onChange();return {ok:true};
  }
}
