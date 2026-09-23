import { HVAC_PORT_LAYOUT, portDirection } from '../../simulation/hvac/ports/HVACPortLayout.js';

const fluid = '/assets/sprites/fluid/';
const machines = '/assets/sprites/machines/';
const airflow = '/assets/sprites/airflow/';
const sensors = '/assets/sprites/sensors/';
const hvac = '/assets/sprites/hvac/';

const definition = (id, path, frames=3, options={}) => ({
  id, path, frameWidth:64, frameHeight:64, frames, fps:2,
  visualScale:1.12, visualWidth:1.12, visualHeight:1.22,
  anchor:{x:.5,y:.78}, footprint:{width:1,height:1},
  ports:[], rotation:true, ...options,
});

export const SPRITES = Object.freeze({
  pump:definition('pump',fluid+'pump.svg',3,{fps:6,visualScale:1.08,ports:[{type:'fluid',x:.05,y:.5,direction:'left'},{type:'fluid',x:.95,y:.5,direction:'right'}]}),
  tank:definition('tank',fluid+'tank.svg',3,{fps:1.4,visualScale:1.34,visualWidth:1.28,visualHeight:1.48,ports:[{type:'fluid',x:.12,y:.72,direction:'left'},{type:'fluid',x:.88,y:.72,direction:'right'}]}),
  radiator:definition('radiator',fluid+'radiator.svg',3,{fps:4,visualScale:1.15,ports:[{type:'fluid',x:0,y:.5,direction:'left'},{type:'fluid',x:1,y:.5,direction:'right'}]}),
  exchanger:definition('exchanger',fluid+'heat_exchanger.svg',3,{fps:2,visualScale:1.12,ports:[{type:'fluid',x:0,y:.5,direction:'left'},{type:'fluid',x:1,y:.5,direction:'right'}]}),
  fan:definition('fan',airflow+'fan.svg',3,{fps:5,visualScale:1.1}),
  exhaust:definition('exhaust',airflow+'exhaust.svg',3,{fps:5,visualScale:1.1}),
  machine:definition('machine',machines+'machine.svg',2,{fps:1.5,visualScale:1.22}),
  serverRack:definition('serverRack',machines+'server_rack.svg',3,{fps:2,visualScale:1.28,visualWidth:1.16,visualHeight:1.38}),
  furnace:definition('furnace',machines+'furnace.svg',3,{fps:5,visualScale:1.34,visualWidth:1.3,visualHeight:1.5}),
  sensor:definition('sensor',sensors+'sensor.svg',2,{fps:1,visualScale:.9,visualWidth:.92,visualHeight:.96}),
  airHandler:definition('airHandler',hvac+'air_handler.svg',3,{fps:2,visualScale:1.3,visualWidth:1.25,visualHeight:1.38,ports:Object.entries(HVAC_PORT_LAYOUT.airHandler).map(([service,port])=>({
    type:service==='refrigerant'?'refrigerant':'air',service,x:.5+port.x*.5,y:.5+port.y*.5,direction:portDirection(port),color:port.color,
  }))}),
  condenser:definition('condenser',hvac+'condenser.svg',3,{fps:3,visualScale:1.28,visualWidth:1.24,visualHeight:1.34,ports:Object.entries(HVAC_PORT_LAYOUT.condenser).map(([service,port])=>({
    type:'refrigerant',service,x:.5+port.x*.5,y:.5+port.y*.5,direction:portDirection(port),color:port.color,
  }))}),
  refrigerantLine:definition('refrigerantLine',hvac+'refrigerant_line.svg',1,{fps:0,visualScale:1}),
  passiveHeat:definition('passiveHeat',machines+'passive_heat.svg',1,{fps:0,visualScale:1.08}),
  supplyVent:definition('supplyVent',hvac+'supply_vent.svg',1,{fps:0,visualScale:1.04}),
  returnVent:definition('returnVent',hvac+'return_vent.svg',1,{fps:0,visualScale:1.04}),
  ductDamper:definition('ductDamper',hvac+'duct_damper.svg',1,{fps:0,visualScale:1}),
});

export const SPRITE_ENTITY_TYPES = Object.freeze(Object.fromEntries(Object.keys(SPRITES).map(type=>[type,type])));

export function validateSpriteManifest(manifest=SPRITES){
  return Object.entries(manifest).filter(([id,sprite])=>!sprite||sprite.id!==id||!sprite.path||
    !Number.isInteger(sprite.frames)||sprite.frames<1||!(sprite.frameWidth>0)||!(sprite.frameHeight>0)||
    !Number.isFinite(sprite.visualScale)||sprite.visualScale<=0||!(sprite.footprint?.width>0)||!(sprite.footprint?.height>0)||
    !sprite.anchor||!Number.isFinite(sprite.anchor.x)||!Number.isFinite(sprite.anchor.y)||
    sprite.ports?.some(port=>!Number.isFinite(port.x)||!Number.isFinite(port.y)||!port.type));
}
