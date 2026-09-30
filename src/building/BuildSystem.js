import { BUILD_CATALOG, STRUCTURE_TOOLS } from './BuildCatalog.js';
import { PlacementValidator } from './PlacementValidator.js';
import { Fan, ExhaustFan, Pipe, Pump, WaterTank, Radiator, HeatExchanger, WaterChiller, TemperatureSensor, AirDuct, CoolingUnit, ServerRack, SupplyVent, PowerBattery, SolarPanel } from '../entities/index.js';
import { DUCT_TOOLS } from './PlacementValidator.js';
import { UtilityPlacementSystem } from './UtilityPlacementSystem.js';
import { DEFAULT_BUDGET } from '../utils/Constants.js';
import { entityFootprintCells } from '../entities/EntityFootprint.js';
import { COOLING_UNIT_MODELS } from '../entities/CoolingUnitModels.js';

export { COOLING_UNIT_MODELS } from '../entities/CoolingUnitModels.js';

const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];

export class BuildSystem {
  constructor(world,simulation,{budget=DEFAULT_BUDGET,inventory=null}={}){
    this.world=world;this.simulation=simulation;this.validator=new PlacementValidator(world);this.utilityPlacement=new UtilityPlacementSystem(world,this.validator);this.ductPlacement=this.utilityPlacement;this.selected=null;this.rotation=0;this.rackRotation=3;this.budget=budget;
    const systems=this.world.thermalSystems;
    const hiddenTools=systems?.allBuildTools?[]:systems?.simpleCooling?[
      ...(!systems.waterCooling?['pipe','pump','tank','radiator','exchanger','waterChiller']:[]),
      ]:
      systems?[
        'duct','coolingUnit','supplyVent',
        ...(!systems.waterCooling?['pipe','pump','tank','radiator','exchanger','waterChiller']:[]),
      ]:[];
    const industrialAvailable=Boolean(systems?.allBuildTools||this.world.datacenterConfig?.allBuildTools);
    this.catalog=Object.fromEntries(Object.entries(BUILD_CATALOG).filter(([k])=>!hiddenTools.includes(k)&&(k!=='serverRack'||Boolean(this.world.datacenterConfig))&&(k!=='industrialCoolingUnit'||industrialAvailable)));
    const defaults=Object.fromEntries(Object.entries(this.catalog).map(([k,v])=>[k,v.inventory]));
    this.unlimitedInventory=Boolean(this.world.datacenterConfig?.unlimitedBuildInventory);
    if(this.unlimitedInventory)this.inventory=Object.fromEntries(Object.keys(defaults).map(k=>[k,Infinity]));
    else if(inventory){this.inventory=Object.fromEntries(Object.keys(defaults).map(k=>[k,['demolish','battery','solarPanel'].includes(k)?Infinity:0]));Object.assign(this.inventory,inventory);this.inventory.battery=Infinity;this.inventory.solarPanel=Infinity;this.inventory.waterChiller??=defaults.waterChiller;}
    else this.inventory=defaults;
    this.initialInventory={...this.inventory};this.placedEntities=new Map();this.placedMaterials=new Map();
    this.ductInsulated=false;this.coolingUnitModel=this.world.thermalSystems?.coolingUnitModel||'commercial';
    this.onChange=()=>{};
  }
  select(tool){this.selected=tool;this.onChange();}
  rotate(){if(this.selected==='serverRack')this.rackRotation=(this.rackRotation+1)%4;else this.rotation=(this.rotation+1)%4;this.onChange();}
  direction(){return DIRS[this.selected==='serverRack'?this.rackRotation:this.rotation];}
  toggleDuctInsulation(){this.ductInsulated=!this.ductInsulated;this.onChange();return this.ductInsulated;}
  cycleCoolingUnitModel(){const tiers=Object.keys(COOLING_UNIT_MODELS),index=tiers.indexOf(this.coolingUnitModel);this.coolingUnitModel=tiers[(index+1)%tiers.length];this.onChange();return COOLING_UNIT_MODELS[this.coolingUnitModel];}
  coolingConfig(tool){return tool==='industrialCoolingUnit'?COOLING_UNIT_MODELS.industrial:tool==='coolingUnit'?COOLING_UNIT_MODELS[this.coolingUnitModel]:null;}
  isIndustrialCooling(tool){return tool==='industrialCoolingUnit'||tool==='coolingUnit'&&this.coolingUnitModel==='industrial';}
  placementCells(tool,x,y){const length=this.isIndustrialCooling(tool)?2:1,d=this.direction();return Array.from({length},(_,offset)=>({x:x+d.x*offset,y:y+d.y*offset}));}
  canPlace(tool,x,y){const footprintLength=this.isIndustrialCooling(tool)?2:1;return this.validator.canPlace(tool,x,y,{direction:this.direction(),footprintLength});}
  canAfford(tool){const c=this.catalog[tool];return c&&this.budget>=(tool==='coolingUnit'?COOLING_UNIT_MODELS[this.coolingUnitModel].cost:c.cost)&&(this.inventory[tool]??0)>0;}

  place(x,y,{refreshCooling=true}={}){
    const tool=this.selected;if(!tool||!this.catalog[tool]||!this.canPlace(tool,x,y))return {ok:false,reason:'Posição inválida ou excede as conexões permitidas'};
    if(tool==='demolish')return this.demolish(x,y);
    if(!this.canAfford(tool))return {ok:false,reason:'Sem orçamento, estoque ou ferramenta bloqueada'};
    if(tool==='serverRack'&&!this.world.datacenter?.nextRackPlacement())return {ok:false,reason:'Aceite um contrato para instalar os racks solicitados.'};
    const before=this.simulation.totalInternalEnergy(),base=this.catalog[tool],coolingConfig=this.coolingConfig(tool),c=coolingConfig?{...base,...coolingConfig}:base;let entity=null;
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
      if(tool==='radiator'){const outdoor=x===0||y===0||x===this.world.width-1||y===this.world.height-1;entity=new Radiator(x,y,{direction:{...dir},outdoor});}
      if(tool==='exchanger')entity=new HeatExchanger(x,y);
      if(tool==='waterChiller')entity=new WaterChiller(x,y);
      if(tool==='sensor')entity=new TemperatureSensor(x,y);
      if(tool==='battery')entity=new PowerBattery(x,y);
      if(tool==='solarPanel')entity=new SolarPanel(x,y);
      if(tool==='coolingUnit'||tool==='industrialCoolingUnit'){
        const model=tool==='industrialCoolingUnit'?'industrial':this.coolingUnitModel;
        entity=new CoolingUnit(x,y,{...COOLING_UNIT_MODELS[model],tier:model,direction:{...dir}});
        const usedIds=new Set(this.world.entitiesByType('coolingUnit').map(unit=>unit.missionId).filter(Boolean));
        let sequence=this.world.coolingUnitSequence||0;
        do{sequence++;}while(usedIds.has('ac-'+sequence));
        this.world.coolingUnitSequence=sequence;entity.missionId='ac-'+sequence;
      }
      if(tool==='serverRack'){
        const assignment=this.world.datacenter?.nextRackPlacement();
        if(!assignment)return {ok:false,reason:'Aceite um contrato para instalar os racks solicitados.'};
        entity=new ServerRack(x,y,{...assignment,name:assignment.clientName+' #'+String(assignment.rackNumber).padStart(2,'0'),heatOutput:assignment.maxPowerKW*980,startAt:0,airIntakeDirection:{...dir},airExhaustDirection:{x:-dir.x,y:-dir.y}});
      }
      if(tool==='supplyVent')entity=new SupplyVent(x,y,{direction:{...dir}});
      if(entity){this.world.addEntity(entity);if(tool==='serverRack')this.world.datacenter?.onRackPlaced(entity);}
    }
    if(entity)this.placedEntities.set(entity.id,{tool,cost:c.cost});
    else if(c.kind==='material')this.placedMaterials.set(this.world.index(x,y),{tool,cost:c.cost});
    this.lastPlacement={x,y,at:globalThis.performance?.now?.()??Date.now()};
    this.budget-=c.cost;if(Number.isFinite(this.inventory[tool]))this.inventory[tool]--;
    if(refreshCooling&&(DUCT_TOOLS.has(tool)||['supplyVent','coolingUnit','industrialCoolingUnit'].includes(tool)))this.simulation.cooling?.rebuild();
    this.simulation.registerConstruction(before);this.onChange();return {ok:true,entity};
  }

  demolish(x,y){
    const before=this.simulation.totalInternalEnergy(),e=this.world.entityAt(x,y);
    if(e){
      if(e.locked)return {ok:false,reason:'Infraestrutura bloqueada pela missão'};
      if((e.isHeatMachine&&!e.contractId&&e.type!=='serverRack')||e.isPassiveHeatSource)return {ok:false,reason:'Equipamento da missão não pode ser removido'};
      if(e.type==='serverRack')this.world.datacenter?.onRackRemoved(e);
      this.world.removeEntity(e);
      if(['supplyVent','coolingUnit'].includes(e.type))this.simulation.cooling?.rebuild();
      const placed=this.placedEntities.get(e.id);
      if(placed){this.placedEntities.delete(e.id);this.recover(placed);}
    }else if(this.world.utilityAt(x,y)){
      const utility=this.world.utilityAt(x,y),placed=this.placedEntities.get(utility.id);
      this.world.removeUtility(utility);
      if(DUCT_TOOLS.has(utility.type))this.simulation.cooling?.rebuild();
      if(placed){this.placedEntities.delete(utility.id);this.recover(placed);}
    }else if(!this.world.isAir(x,y)){
      const index=this.world.index(x,y),placed=this.placedMaterials.get(index);
      this.world.setMaterial(x,y,'air');
      if(placed){this.placedMaterials.delete(index);this.recover(placed);}
    }
    else return {ok:false,reason:'Nada removível'};
    this.simulation.registerConstruction(before);this.onChange();return {ok:true};
  }

  demolishArea(start,end=start){
    const minX=Math.max(0,Math.min(start.x,end.x)),maxX=Math.min(this.world.width-1,Math.max(start.x,end.x));
    const minY=Math.max(0,Math.min(start.y,end.y)),maxY=Math.min(this.world.height-1,Math.max(start.y,end.y));
    if(minX>maxX||minY>maxY)return {ok:false,removed:0,blocked:0,refund:0};
    const inArea=cell=>cell.x>=minX&&cell.x<=maxX&&cell.y>=minY&&cell.y<=maxY;
    const intersects=entity=>entityFootprintCells(entity).some(inArea);
    const before=this.simulation.totalInternalEnergy(),budgetBefore=this.budget;
    let removed=0,blocked=0,entities=0,utilities=0,materials=0,coolingChanged=false;
    for(const entity of [...this.world.entities]){
      if(entity.isTechnician||!intersects(entity))continue;
      if(entity.locked||(entity.isHeatMachine&&!entity.contractId&&entity.type!=='serverRack')||entity.isPassiveHeatSource){blocked++;continue;}
      if(entity.type==='serverRack')this.world.datacenter?.onRackRemoved(entity);
      this.world.removeEntity(entity);entities++;removed++;
      const placed=this.placedEntities.get(entity.id);
      if(placed){this.placedEntities.delete(entity.id);this.recover(placed);}
      if(['supplyVent','coolingUnit'].includes(entity.type))coolingChanged=true;
    }
    for(const utility of [...this.world.allUtilities()]){
      if(!inArea(utility))continue;
      this.world.removeUtility(utility);utilities++;removed++;
      const placed=this.placedEntities.get(utility.id);
      if(placed){this.placedEntities.delete(utility.id);this.recover(placed);}
      if(DUCT_TOOLS.has(utility.type))coolingChanged=true;
    }
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      if(this.world.isAir(x,y))continue;
      const index=this.world.index(x,y),placed=this.placedMaterials.get(index);
      this.world.setMaterial(x,y,'air');materials++;removed++;
      if(placed){this.placedMaterials.delete(index);this.recover(placed);}
    }
    if(!removed)return {ok:false,removed:0,blocked,refund:0,entities,utilities,materials};
    if(coolingChanged)this.simulation.cooling?.rebuild();
    this.simulation.registerConstruction(before);this.world.datacenter?.persist();this.onChange();
    return {ok:true,removed,blocked,refund:this.budget-budgetBefore,entities,utilities,materials};
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

  placeStructurePath(path){
    let placed=0,failed=0;const seen=new Set();
    for(const {x,y} of path){
      const key=`${x},${y}`;if(seen.has(key))continue;seen.add(key);
      if(!STRUCTURE_TOOLS.has(this.selected)){failed++;continue;}
      if(this.place(x,y).ok)placed++;else failed++;
    }
    return {placed,failed};
  }

  placeDuctPath(path){
    const tool=this.selected,cost=this.catalog[tool]?.cost??0;
    const plan=this.utilityPlacement.planPath(tool,path,{inventory:this.inventory[tool]??0,budget:this.budget,cost});
    let placed=0,failed=0;
    for(const point of plan.entries){
      if(point.connect)continue;
      if(!point.valid){failed++;continue;}
      if(this.place(point.x,point.y,{refreshCooling:false}).ok)placed++;else failed++;
    }
    if(placed)this.simulation.cooling?.rebuild();
    return {placed,failed};
  }

  recover({tool,cost}){
    this.budget+=cost;
    if(Number.isFinite(this.inventory[tool]))this.inventory[tool]=Math.min(this.initialInventory[tool]??Infinity,this.inventory[tool]+1);
  }
}
