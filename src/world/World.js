import { MaterialRegistry } from './MaterialRegistry.js';
import { TileMap } from './TileMap.js';
import { TILE_VOLUME, OUTDOOR_TEMP } from '../utils/Constants.js';
import { utilityCanShareTile } from '../entities/UtilityCompatibility.js';
import { entityFootprintCells } from '../entities/EntityFootprint.js';

const COOLING_ENTITIES=new Set(['coolingUnit','supplyVent']);
const FLUID_ENTITIES=new Set(['pipe','pump','tank','radiator','exchanger']);
const FLUID_UTILITIES=new Set(['pipe']);
const EMPTY_ENTITY_SET=new Set();
const occupiesEntityCell=entity=>!entity.isTechnician;

export class World {
  constructor(width,height){
    this.width=width;this.height=height;this.size=width*height;
    this.registry=new MaterialRegistry();
    this.material=new Uint8Array(this.size);
    this.thermalCapacity=new Float64Array(this.size);this.thermalConductivity=new Float64Array(this.size);this.airMaterial=new Uint8Array(this.size);
    this.energy=new Float64Array(this.size);
    this.nextEnergy=new Float64Array(this.size);
    this.airX=new Float32Array(this.size);
    this.airY=new Float32Array(this.size);
    this.airPressure=new Float32Array(this.size);
    this.airDivergence=new Float32Array(this.size);
    this.airWallProximity=new Uint8Array(this.size);
    this.airWallConfinement=new Uint8Array(this.size);
    this.airDiagnostics={maxVelocity:0,averageVelocity:0,maxPressure:0,minPressure:0,maxDivergence:0};
    this.airTopologyVersion=0;
    this.utilityTopologyVersion=0;
    this.fluidTopologyVersion=0;this.materialTopologyVersion=0;this.entityVisualVersion=0;
    this.heatFlux=new Float32Array(this.size);
    this.tileMap=new TileMap(this);
    this.entities=[];this.entityByCell=new Map();this.entitiesByTypeIndex=new Map();this.heatMachines=new Set();this.passiveHeatSources=new Set();
    this.entityOrderIndex=new WeakMap();this.entityOrderSequence=0;
    this.utilityLayer=new Map();
    this.environment={temperature:OUTDOOR_TEMP,energyReceived:0};
    this.fill('air',OUTDOOR_TEMP);
  }

  index(x,y){return y*this.width+x;}
  coords(i){return{x:i%this.width,y:Math.floor(i/this.width)};}
  inBounds(x,y){return x>=0&&y>=0&&x<this.width&&y<this.height;}
  materialAt(x,y){return this.registry.fromIndex(this.material[this.index(x,y)]);}

  massAt(x,y){
    const m=this.materialAt(x,y);
    return Math.max(.0001,m.density*TILE_VOLUME);
  }

  capacityAtIndex(i){
    return this.thermalCapacity[i]||.001;
  }

  isAirIndex(i){return this.airMaterial[i]===1;}
  setMaterialProperties(index,materialIndex){
    const material=this.registry.fromIndex(materialIndex);
    this.thermalCapacity[index]=Math.max(.001,material.density*TILE_VOLUME*material.heatCapacity);
    this.thermalConductivity[index]=material.conductivity;
    this.airMaterial[index]=material.id==='air'?1:0;
  }
  rebuildMaterialProperties(){for(let i=0;i<this.size;i++)this.setMaterialProperties(i,this.material[i]);}

  temperatureAt(x,y){const i=this.index(x,y);return this.energy[i]/this.capacityAtIndex(i);}
  temperatureAtIndex(i){return this.energy[i]/this.capacityAtIndex(i);}
  setTemperature(x,y,temp){const i=this.index(x,y);this.energy[i]=this.capacityAtIndex(i)*temp;}

  setMaterial(x,y,id,{preserveTemperature=true}={}){
    if(!this.inBounds(x,y))return false;
    const i=this.index(x,y);
    const oldMaterial=this.registry.fromIndex(this.material[i]);
    const nextMaterial=this.registry.get(id);
    const t=preserveTemperature?this.temperatureAtIndex(i):OUTDOOR_TEMP;
    this.material[i]=this.registry.index(id);
    this.setMaterialProperties(i,this.material[i]);
    this.energy[i]=this.capacityAtIndex(i)*t;
    if(oldMaterial?.id!==nextMaterial?.id)this.materialTopologyVersion++;
    if(oldMaterial?.solid!==nextMaterial?.solid)this.airTopologyVersion++;
    return true;
  }

  fill(id,temp=OUTDOOR_TEMP){
    const mi=this.registry.index(id),material=this.registry.fromIndex(mi);this.material.fill(mi);
    this.thermalCapacity.fill(Math.max(.001,material.density*TILE_VOLUME*material.heatCapacity));this.thermalConductivity.fill(material.conductivity);this.airMaterial.fill(material.id==='air'?1:0);
    for(let i=0;i<this.size;i++)this.energy[i]=this.capacityAtIndex(i)*temp;
    this.airTopologyVersion++;this.materialTopologyVersion++;
  }

  isAir(x,y){return this.inBounds(x,y)&&this.materialAt(x,y).id==='air';}
  addEnergyAt(x,y,joules){if(this.inBounds(x,y))this.energy[this.index(x,y)]+=joules;}
  bumpUtilityTopology(){this.utilityTopologyVersion++;}
  addEntity(entity){
    this.entities.push(entity);entity.world=this;this.entityVisualVersion++;this.entityOrderIndex.set(entity,++this.entityOrderSequence);
    let typed=this.entitiesByTypeIndex.get(entity.type);if(!typed)this.entitiesByTypeIndex.set(entity.type,typed=new Set());typed.add(entity);
    if(entity.isHeatMachine)this.heatMachines.add(entity);if(entity.isPassiveHeatSource)this.passiveHeatSources.add(entity);
    if(occupiesEntityCell(entity))for(const cell of entityFootprintCells(entity))if(this.inBounds(cell.x,cell.y)){const index=this.index(cell.x,cell.y);if(!this.entityByCell.has(index))this.entityByCell.set(index,entity);}
    if(COOLING_ENTITIES.has(entity.type))this.bumpUtilityTopology();if(FLUID_ENTITIES.has(entity.type))this.fluidTopologyVersion++;
    return entity;
  }
  removeEntity(entity){
    const position=this.entities.indexOf(entity);if(position<0)return false;
    this.entities.splice(position,1);this.entityVisualVersion++;
    this.entitiesByTypeIndex.get(entity.type)?.delete(entity);
    this.heatMachines.delete(entity);this.passiveHeatSources.delete(entity);
    if(occupiesEntityCell(entity))for(const cell of entityFootprintCells(entity))if(this.inBounds(cell.x,cell.y)){const index=this.index(cell.x,cell.y);if(this.entityByCell.get(index)===entity){this.entityByCell.delete(index);const replacement=this.entities.find(candidate=>occupiesEntityCell(candidate)&&entityFootprintCells(candidate).some(item=>this.inBounds(item.x,item.y)&&this.index(item.x,item.y)===index));if(replacement)this.entityByCell.set(index,replacement);}}
    if(COOLING_ENTITIES.has(entity.type))this.bumpUtilityTopology();if(FLUID_ENTITIES.has(entity.type))this.fluidTopologyVersion++;
    return true;
  }
  clearEntities(){
    const removed=this.entities;this.entities=[];this.entityByCell.clear();this.entitiesByTypeIndex.clear();this.heatMachines.clear();this.passiveHeatSources.clear();this.entityVisualVersion++;
    if(removed.some(entity=>COOLING_ENTITIES.has(entity.type)))this.bumpUtilityTopology();
    if(removed.some(entity=>FLUID_ENTITIES.has(entity.type)))this.fluidTopologyVersion++;
  }
  clearUtilities(){
    if(!this.utilityLayer.size)return false;
    const hadFluid=Array.from(this.utilityLayer.values()).flat().some(utility=>FLUID_UTILITIES.has(utility.type));
    this.utilityLayer.clear();this.bumpUtilityTopology();if(hadFluid)this.fluidTopologyVersion++;return true;
  }
  moveEntity(entity,x,y){
    if(!this.entities.includes(entity)||entity.x===x&&entity.y===y)return false;
    if(occupiesEntityCell(entity))for(const cell of entityFootprintCells(entity))if(this.inBounds(cell.x,cell.y)){const index=this.index(cell.x,cell.y);if(this.entityByCell.get(index)===entity)this.entityByCell.delete(index);}
    entity.x=x;entity.y=y;this.entityVisualVersion++;
    if(occupiesEntityCell(entity))for(const cell of entityFootprintCells(entity))if(this.inBounds(cell.x,cell.y)){const index=this.index(cell.x,cell.y);if(!this.entityByCell.has(index))this.entityByCell.set(index,entity);}
    if(COOLING_ENTITIES.has(entity.type))this.bumpUtilityTopology();if(FLUID_ENTITIES.has(entity.type))this.fluidTopologyVersion++;
    return true;
  }
  utilitiesAt(x,y){return this.utilityLayer.get(this.index(x,y))||[];}
  utilityAt(x,y,type=null){return this.utilitiesAt(x,y).find(item=>!type||item.type===type)||null;}
  addUtility(utility){
    if(!this.inBounds(utility.x,utility.y))return null;
    const index=this.index(utility.x,utility.y),items=this.utilityLayer.get(index)||[];
    if(!utilityCanShareTile(utility.type,items))return null;
    utility.world=this;items.push(utility);this.utilityLayer.set(index,items);this.bumpUtilityTopology();if(FLUID_UTILITIES.has(utility.type))this.fluidTopologyVersion++;return utility;
  }
  removeUtility(utility){
    const index=this.index(utility.x,utility.y),items=this.utilityLayer.get(index)||[];
    const next=items.filter(item=>item!==utility);
    if(next.length)this.utilityLayer.set(index,next);else this.utilityLayer.delete(index);
    if(next.length!==items.length){this.bumpUtilityTopology();if(FLUID_UTILITIES.has(utility.type))this.fluidTopologyVersion++;}
  }
  allUtilities(){return [...this.utilityLayer.values()].flat();}
  entityAt(x,y){return this.inBounds(x,y)?this.entityByCell.get(this.index(x,y)):undefined;}
  entitySetByType(type){return this.entitiesByTypeIndex.get(type)||EMPTY_ENTITY_SET;}
  entityOrder(entity){return this.entityOrderIndex.get(entity)||0;}
  entitiesByType(type){return [...this.entitySetByType(type)];}
  totalTileEnergy(){let s=0;for(let i=0;i<this.size;i++)s+=this.energy[i];return s;}
}
