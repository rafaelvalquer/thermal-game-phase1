import { MaterialRegistry } from './MaterialRegistry.js';
import { TileMap } from './TileMap.js';
import { TILE_VOLUME, OUTDOOR_TEMP } from '../utils/Constants.js';

export class World {
  constructor(width,height){
    this.width=width;this.height=height;this.size=width*height;
    this.registry=new MaterialRegistry();
    this.material=new Uint8Array(this.size);
    this.energy=new Float64Array(this.size);
    this.nextEnergy=new Float64Array(this.size);
    this.airX=new Float32Array(this.size);
    this.airY=new Float32Array(this.size);
    this.airPressure=new Float32Array(this.size);
    this.airDivergence=new Float32Array(this.size);
    this.airWallProximity=new Uint8Array(this.size);
    this.airDiagnostics={maxVelocity:0,averageVelocity:0,maxPressure:0,minPressure:0,maxDivergence:0};
    this.airTopologyVersion=0;
    this.heatFlux=new Float32Array(this.size);
    this.tileMap=new TileMap(this);
    this.entities=[];
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
    const m=this.registry.fromIndex(this.material[i]);
    return Math.max(.001,m.density*TILE_VOLUME*m.heatCapacity);
  }

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
    this.energy[i]=this.capacityAtIndex(i)*t;
    if(oldMaterial?.solid!==nextMaterial?.solid)this.airTopologyVersion++;
    return true;
  }

  fill(id,temp=OUTDOOR_TEMP){
    const mi=this.registry.index(id);this.material.fill(mi);
    for(let i=0;i<this.size;i++)this.energy[i]=this.capacityAtIndex(i)*temp;
    this.airTopologyVersion++;
  }

  isAir(x,y){return this.inBounds(x,y)&&this.materialAt(x,y).id==='air';}
  addEnergyAt(x,y,joules){if(this.inBounds(x,y))this.energy[this.index(x,y)]+=joules;}
  addEntity(entity){this.entities.push(entity);return entity;}
  removeEntity(entity){this.entities=this.entities.filter(e=>e!==entity);}
  entityAt(x,y){return this.entities.find(e=>e.x===x&&e.y===y);}
  entitiesByType(type){return this.entities.filter(e=>e.type===type);}
  totalTileEnergy(){let s=0;for(let i=0;i<this.size;i++)s+=this.energy[i];return s;}
}
