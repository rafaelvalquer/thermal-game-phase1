import { World } from '../world/World.js';
import { MapBuilder } from './MapBuilder.js';
import { Machine, ServerRack, Furnace, PassiveHeatSource, Fan, ExhaustFan, Pipe, Pump, WaterTank, Radiator, HeatExchanger, TemperatureSensor } from '../entities/index.js';

const constructors={
  machine:(d)=>new Machine(d.x,d.y,d),
  serverRack:(d)=>new ServerRack(d.x,d.y,d),
  furnace:(d)=>new Furnace(d.x,d.y,d),
  passiveHeat:(d)=>new PassiveHeatSource(d.x,d.y,d),
  fan:(d)=>new Fan(d.x,d.y,d.direction||{x:1,y:0}),
  exhaust:(d)=>new ExhaustFan(d.x,d.y,d.direction||{x:1,y:0}),
  pipe:(d)=>new Pipe(d.x,d.y,d),
  pump:(d)=>new Pump(d.x,d.y),
  tank:(d)=>new WaterTank(d.x,d.y),
  radiator:(d)=>new Radiator(d.x,d.y),
  exchanger:(d)=>new HeatExchanger(d.x,d.y),
  sensor:(d)=>new TemperatureSensor(d.x,d.y),
};

export class LevelManager {
  constructor(){this.currentLevel=null;this.world=null;}

  load(level){
    this.currentLevel=level;
    const world=new World(level.map.width,level.map.height);
    world.environment.temperature=level.environment?.outdoorTemperature??25;
    MapBuilder.apply(world,level.map);
    world.zones=level.zones||[];world.levelId=level.id;
    for(const def of level.entities||[]){
      const factory=constructors[def.type];if(!factory)continue;
      const entity=factory(def);
      entity.missionId=def.id||entity.missionId||null;entity.zoneId=def.zoneId||null;entity.category=def.category||entity.category||null;
      entity.locked=!!def.locked;
      if(def.enabled===false)entity.enabled=false;
      if(def.startAt!=null)entity.startAt=def.startAt;
      if(def.failureTemperature!=null)entity.failureTemperature=def.failureTemperature;
      if(def.loadMultiplier!=null)entity.loadMultiplier=def.loadMultiplier;
      if(def.waterTemperature!=null&&typeof entity.waterMass==='number')entity.energy=entity.waterMass*4186*def.waterTemperature;
      world.addEntity(entity);
    }
    this.world=world;return world;
  }

  reset(){return this.currentLevel?this.load(this.currentLevel):null;}
  complete(){return {levelId:this.currentLevel?.id,world:this.world};}
}
