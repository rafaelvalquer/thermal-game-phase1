import { BUILD_CATALOG } from './BuildCatalog.js';
import { PlacementValidator } from './PlacementValidator.js';
import { Fan, ExhaustFan, Pipe, Pump, WaterTank, Radiator, HeatExchanger, TemperatureSensor, AirDuct, CoolingUnit, ServerRack, SupplyVent } from '../entities/index.js';
import { DUCT_TOOLS } from './PlacementValidator.js';
import { UtilityPlacementSystem } from './UtilityPlacementSystem.js';
import { DEFAULT_BUDGET } from '../utils/Constants.js';

export const COOLING_UNIT_MODELS=Object.freeze({
  compact:{label:'Compacta',cost:4000,ratedCoolingCapacity:10000,maxAirFlow:1.2,cop:3.5,fanPower:300},
  commercial:{label:'Comercial',cost:8000,ratedCoolingCapacity:25000,maxAirFlow:2.5,cop:3.5,fanPower:700},
  industrial:{label:'Industrial',cost:14000,ratedCoolingCapacity:50000,maxAirFlow:5,cop:3.2,fanPower:1400},
});

const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];

export class BuildSystem {
  constructor(world,simulation,{budget=DEFAULT_BUDGET,inventory=null}={}){
    this.world=world;this.simulation=simulation;this.validator=new PlacementValidator(world);this.utilityPlacement=new UtilityPlacementSystem(world,this.validator);this.ductPlacement=this.utilityPlacement;this.selected=null;this.rotation=0;this.budget=budget;
    const systems=this.world.thermalSystems;
    const hiddenTools=systems?.allBuildTools?[]:systems?.simpleCooling?[
      ...(!systems.waterCooling?['pipe','pump','tank','radiator','exchanger']:[]),
      ]:
      systems?[
        'duct','coolingUnit','supplyVent',
        ...(!systems.waterCooling?['pipe','pump','tank','radiator','exchanger']:[]),
      ]:[];
    this.catalog=Object.fromEntries(Object.entries(BUILD_CATALOG).filter(([k])=>!hiddenTools.includes(k)&&(k!=='serverRack'||Boolean(this.world.datacenterConfig))));
    const defaults=Object.fromEntries(Object.entries(this.catalog).map(([k,v])=>[k,v.inventory]));
    this.unlimitedInventory=Boolean(this.world.datacenterConfig?.unlimitedBuildInventory);
    if(this.unlimitedInventory)this.inventory=Object.fromEntries(Object.keys(defaults).map(k=>[k,Infinity]));
    else if(inventory){this.inventory=Object.fromEntries(Object.keys(defaults).map(k=>[k,k==='demolish'?Infinity:0]));Object.assign(this.inventory,inventory);}
    else this.inventory=defaults;
    this.initialInventory={...this.inventory};this.placedEntities=new Map();this.placedMaterials=new Map();
    this.ductInsulated=false;this.coolingUnitModel=this.world.thermalSystems?.coolingUnitModel||'commercial';
    this.onChange=()=>{};
  }
  select(tool){this.selected=tool;this.onChange();}
  rotate(){this.rotation=(this.rotation+1)%4;this.onChange();}
  direction(){return DIRS[this.rotation];}
  toggleDuctInsulation(){this.ductInsulated=!this.ductInsulated;this.onChange();return this.ductInsulated;}
  cycleCoolingUnitModel(){const tiers=Object.keys(COOLING_UNIT_MODELS),index=tiers.indexOf(this.coolingUnitModel);this.coolingUnitModel=tiers[(index+1)%tiers.length];this.onChange();return COOLING_UNIT_MODELS[this.coolingUnitModel];}
  canAfford(tool){const c=this.catalog[tool];return c&&this.budget>=(tool==='coolingUnit'?COOLING_UNIT_MODELS[this.coolingUnitModel].cost:c.cost)&&(this.inventory[tool]??0)>0;}

  place(x,y){
    const tool=this.selected;if(!tool||!this.catalog[tool]||!this.validator.canPlace(tool,x,y))return {ok:false,reason:'Posição inválida ou criaria uma ramificação hidráulica'};
    if(tool==='demolish')return this.demolish(x,y);
    if(!this.canAfford(tool))return {ok:false,reason:'Sem orçamento, estoque ou ferramenta bloqueada'};
    if(tool==='serverRack'&&!this.world.datacenter?.nextRackPlacement())return {ok:false,reason:'Aceite um contrato para instalar os racks solicitados.'};
    const before=this.simulation.totalInternalEnergy(),base=this.catalog[tool],c=tool==='coolingUnit'?{...base,...COOLING_UNIT_MODELS[this.coolingUnitModel]}:base;let entity=null;
    if(c.kind==='material')this.world.setMaterial(x,y,c.material);
    else if(DUCT_TOOLS.has(tool)){
      entity=new AirDuct(x,y,{size:tool,embedded:!this.world.isAir(x,y),insulated:tool==='duct'?true:this.ductInsulated});
      if(!this.world.addUtility(entity))return {ok:false,reason:'Utility incompatível nesta posição'};
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
      if(tool==='coolingUnit'){
        entity=new CoolingUnit(x,y,{...COOLING_UNIT_MODELS[this.coolingUnitModel],tier:this.coolingUnitModel,direction:{...dir}});
        const usedIds=new Set(this.world.entitiesByType('coolingUnit').map(unit=>unit.missionId).filter(Boolean));
        let sequence=this.world.coolingUnitSequence||0;
        do{sequence++;}while(usedIds.has('ac-'+sequence));
        this.world.coolingUnitSequence=sequence;entity.missionId='ac-'+sequence;
      }
      if(tool==='serverRack'){
        const assignment=this.world.datacenter?.nextRackPlacement();
        if(!assignment)return {ok:false,reason:'Aceite um contrato para instalar os racks solicitados.'};
        entity=new ServerRack(x,y,{...assignment,name:assignment.clientName+' #'+String(assignment.rackNumber).padStart(2,'0'),heatOutput:assignment.maxPowerKW*980,startAt:0});
      }
      if(tool==='supplyVent')entity=new SupplyVent(x,y,{direction:{...dir}});
      if(entity){this.world.addEntity(entity);if(tool==='serverRack')this.world.datacenter?.onRackPlaced(entity);}
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
      if((e.isHeatMachine&&!e.contractId)||e.isPassiveHeatSource)return {ok:false,reason:'Equipamento da missão não pode ser removido'};
      if(e.type==='serverRack')this.world.datacenter?.onRackRemoved(e);
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
    const tool=this.selected,cost=this.catalog[tool]?.cost??0;
    const plan=this.utilityPlacement.planPath(tool,path,{inventory:this.inventory[tool]??0,budget:this.budget,cost});
    let placed=0,failed=0;
    for(const point of plan.entries){
      if(!point.valid){failed++;continue;}
      if(this.place(point.x,point.y).ok)placed++;else failed++;
    }
    return {placed,failed};
  }

  recover({tool,cost}){
    this.budget+=cost;
    if(Number.isFinite(this.inventory[tool]))this.inventory[tool]=Math.min(this.initialInventory[tool]??Infinity,this.inventory[tool]+1);
  }
}
