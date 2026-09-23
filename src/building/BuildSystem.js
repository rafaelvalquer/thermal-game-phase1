import { BUILD_CATALOG } from './BuildCatalog.js';
import { PlacementValidator } from './PlacementValidator.js';
import { Fan, ExhaustFan, Pipe, Pump, WaterTank, Radiator, HeatExchanger, TemperatureSensor, AirDuct, AirHandler, Condenser, SupplyVent, ReturnVent, DuctDamper } from '../entities/index.js';
import { DUCT_TOOLS } from './PlacementValidator.js';
import { DuctPlacementSystem } from './DuctPlacementSystem.js';
import { DEFAULT_BUDGET } from '../utils/Constants.js';

const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];

export class BuildSystem {
  constructor(world,simulation,{budget=DEFAULT_BUDGET,inventory=null}={}){
    this.world=world;this.simulation=simulation;this.validator=new PlacementValidator(world);this.ductPlacement=new DuctPlacementSystem(world,this.validator);this.selected=null;this.rotation=0;this.budget=budget;
    const defaults=Object.fromEntries(Object.entries(BUILD_CATALOG).map(([k,v])=>[k,v.inventory]));
    if(inventory){this.inventory=Object.fromEntries(Object.keys(defaults).map(k=>[k,k==='demolish'?Infinity:0]));Object.assign(this.inventory,inventory);}
    else this.inventory=defaults;
    this.initialInventory={...this.inventory};this.placedEntities=new Map();this.placedMaterials=new Map();
    this.ductInsulated=false;
    this.onChange=()=>{};
  }
  select(tool){this.selected=tool;this.onChange();}
  rotate(){this.rotation=(this.rotation+1)%4;this.onChange();}
  direction(){return DIRS[this.rotation];}
  toggleDuctInsulation(){this.ductInsulated=!this.ductInsulated;this.onChange();return this.ductInsulated;}
  canAfford(tool){const c=BUILD_CATALOG[tool];return c&&this.budget>=c.cost&&(this.inventory[tool]??0)>0;}

  place(x,y,{ductRole=this.ductRoleAt(x,y)}={}){
    const tool=this.selected;if(!tool||!this.validator.canPlace(tool,x,y))return {ok:false,reason:'Posição inválida ou criaria uma ramificação hidráulica'};
    if(tool==='demolish')return this.demolish(x,y);
    if(!this.canAfford(tool))return {ok:false,reason:'Sem orçamento, estoque ou ferramenta bloqueada'};
    const before=this.simulation.totalInternalEnergy(),c=BUILD_CATALOG[tool];let entity=null;
    if(c.kind==='material')this.world.setMaterial(x,y,c.material);
    else if(DUCT_TOOLS.has(tool)){
      entity=new AirDuct(x,y,{size:tool,embedded:!this.world.isAir(x,y),role:ductRole,insulated:this.ductInsulated});
      this.world.addUtility(entity);
    }
    else if(tool==='damper'){
      entity=new DuctDamper(x,y);this.world.addUtility(entity);
    }
    else{
      const dir=this.direction();
      if(tool==='fan')entity=new Fan(x,y,{...dir});
      if(tool==='exhaust')entity=new ExhaustFan(x,y,{...dir});
      if(tool==='pipe')entity=new Pipe(x,y);
      if(tool==='pump')entity=new Pump(x,y,{...dir});
      if(tool==='tank')entity=new WaterTank(x,y);
      if(tool==='radiator')entity=new Radiator(x,y);
      if(tool==='exchanger')entity=new HeatExchanger(x,y);
      if(tool==='sensor')entity=new TemperatureSensor(x,y);
      if(tool==='airHandler')entity=new AirHandler(x,y);
      if(tool==='condenser')entity=new Condenser(x,y);
      if(tool==='supplyVent')entity=new SupplyVent(x,y,{direction:{...dir}});
      if(tool==='returnVent')entity=new ReturnVent(x,y,{direction:{...dir}});
      if(entity)this.world.addEntity(entity);
    }
    if(entity)this.placedEntities.set(entity.id,{tool,cost:c.cost});
    else if(c.kind==='material')this.placedMaterials.set(this.world.index(x,y),{tool,cost:c.cost});
    this.lastPlacement={x,y,at:globalThis.performance?.now?.()??Date.now()};
    this.budget-=c.cost;if(Number.isFinite(this.inventory[tool]))this.inventory[tool]--;
    this.simulation.registerConstruction(before);this.onChange();return {ok:true,entity};
  }

  demolish(x,y){
    const before=this.simulation.totalInternalEnergy(),e=this.world.entityAt(x,y);
    if(e){
      if(e.locked)return {ok:false,reason:'Infraestrutura bloqueada pela missão'};
      if(e.isHeatMachine||e.isPassiveHeatSource)return {ok:false,reason:'Equipamento da missão não pode ser removido'};
      this.world.removeEntity(e);
      const placed=this.placedEntities.get(e.id);
      if(placed){this.placedEntities.delete(e.id);this.recover(placed);}
    }else if(this.world.utilityAt(x,y)){
      const utility=this.world.utilityAt(x,y),placed=this.placedEntities.get(utility.id);
      this.world.removeUtility(utility);
      if(placed){this.placedEntities.delete(utility.id);this.recover(placed);}
    }else if(!this.world.isAir(x,y)){
      const index=this.world.index(x,y),placed=this.placedMaterials.get(index);
      this.world.setMaterial(x,y,'air');
      if(placed){this.placedMaterials.delete(index);this.recover(placed);}
    }
    else return {ok:false,reason:'Nada removível'};
    this.simulation.registerConstruction(before);this.onChange();return {ok:true};
  }

  placePipePath(path){
    let placed=0,failed=0;const seen=new Set();
    for(const {x,y} of path){
      const key=`${x},${y}`;if(seen.has(key))continue;seen.add(key);
      if(this.selected!=='pipe'){failed++;continue;}
      if(!this.canAfford('pipe')){failed++;continue;}
      const result=this.place(x,y);
      if(result.ok)placed++;else failed++;
    }
    return {placed,failed};
  }

  placeDuctPath(path){
    const tool=this.selected,cost=BUILD_CATALOG[tool]?.cost??0;
    const plan=this.ductPlacement.planPath(tool,path,{inventory:this.inventory[tool]??0,budget:this.budget,cost});
    let placed=0,failed=0;
    for(const point of plan.entries){
      if(!point.valid){failed++;continue;}
      if(this.place(point.x,point.y,{ductRole:point.role}).ok)placed++;else failed++;
    }
    return {placed,failed};
  }

  ductRoleAt(x,y){return this.ductPlacement.roleAt(x,y);}

  ductRoleForPath(path){return this.ductPlacement.roleForPath(path);}

  recover({tool,cost}){
    this.budget+=cost;
    if(Number.isFinite(this.inventory[tool]))this.inventory[tool]=Math.min(this.initialInventory[tool]??Infinity,this.inventory[tool]+1);
  }
}
