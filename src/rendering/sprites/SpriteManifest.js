const definition=(id,path,frames=4,options={})=>({
  id,path:'/assets/sprites/'+path,frameWidth:64,frameHeight:64,frames,rows:2,fps:2,
  stateRows:{running:0,idle:1,off:1,blocked:1},
  visualScale:1.12,visualWidth:1.12,visualHeight:1.22,anchor:{x:.5,y:.78},
  footprint:{width:1,height:1},ports:[],rotation:true,...options,
});
const fluidPorts=[{type:'fluid',x:.05,y:.5,direction:'left'},{type:'fluid',x:.95,y:.5,direction:'right'}];
export const SPRITES=Object.freeze({
  pump:definition('pump','fluid/pump.svg',6,{ports:fluidPorts}),
  tank:definition('tank','fluid/tank.svg',4,{visualWidth:1.28,visualHeight:1.48,ports:fluidPorts}),
  radiator:definition('radiator','fluid/radiator.svg',6,{ports:fluidPorts}),
  exchanger:definition('exchanger','fluid/heat_exchanger.svg',4,{ports:fluidPorts}),
  waterChiller:definition('waterChiller','fluid/water_chiller.svg',4,{stateRows:{running:0,idle:1,off:1,blocked:1},ports:fluidPorts}),
  fan:definition('fan','airflow/fan.svg',6),
  exhaust:definition('exhaust','airflow/exhaust.svg',6),
  machine:definition('machine','machines/machine.svg',4),
  serverRack:definition('serverRack','machines/server_rack.svg',4,{visualWidth:1.16,visualHeight:1.38}),
  computeRackCpu:definition('computeRackCpu','machines/compute_cpu_rack.svg',4,{visualWidth:1.16,visualHeight:1.38}),
  computeRackGpu:definition('computeRackGpu','machines/compute_gpu_rack.svg',4,{visualWidth:1.16,visualHeight:1.38}),
  computeRackStorage:definition('computeRackStorage','machines/compute_storage_rack.svg',4,{visualWidth:1.16,visualHeight:1.38}),
  technician:definition('technician','machines/technician.svg',4,{rows:12,stateRows:{running:0,idle:8,off:8,blocked:8,...Object.fromEntries(['walking','working','idle'].flatMap((action,a)=>['north','east','south','west'].map((direction,d)=>[`technician-${action}-${direction}`,a*4+d])))},visualWidth:.9,visualHeight:1.08,anchor:{x:.5,y:.9}}),
  furnace:definition('furnace','machines/furnace.svg',4,{visualWidth:1.3,visualHeight:1.5}),
  sensor:definition('sensor','sensors/sensor.svg',4,{visualWidth:.92,visualHeight:.96}),
  battery:definition('battery','power/battery.svg',4,{visualWidth:1.12,visualHeight:1.28}),
  solarPanel:definition('solarPanel','power/solar_panel.svg',4,{visualWidth:1.16,visualHeight:.94,anchor:{x:.5,y:.82},rotation:false}),
  coolingUnit:definition('coolingUnit','cooling/condenser.svg',6,{rotation:false}),
  coolingCompact:definition('coolingCompact','cooling/compact.svg',6,{rotation:false}),
  coolingIndustrial:definition('coolingIndustrial','cooling/industrial.svg',6,{frameWidth:128,rotation:false,footprint:{width:2,height:1}}),
  supplyVent:definition('supplyVent','cooling/supply_vent.svg',4,{visualWidth:1.04,visualHeight:1.04,anchor:{x:.5,y:.5}}),
  passiveHeat:definition('passiveHeat','machines/passive_heat.svg',1),
});
export const SPRITE_ENTITY_TYPES=Object.freeze(Object.fromEntries(Object.keys(SPRITES).map(type=>[type,type])));
export function spriteIdFor(entity){return entity.type==='coolingUnit'?(entity.tier==='industrial'?'coolingIndustrial':entity.tier==='compact'?'coolingCompact':'coolingUnit'):entity.type==='computeRack'?'computeRack'+({cpu:'Cpu',gpu:'Gpu',storage:'Storage'}[entity.specialization]||'Cpu'):SPRITE_ENTITY_TYPES[entity.type];}
export function spriteIconStyle(entity,variable='--entity-sprite'){
  const sprite=SPRITES[spriteIdFor(entity)];if(!sprite)return '';
  return `${variable}:url(${sprite.path});--sprite-columns:${sprite.frames};--sprite-rows:${sprite.rows};--sprite-aspect:${sprite.frameWidth/sprite.frameHeight}`;
}
export function validateSpriteManifest(manifest=SPRITES){return Object.entries(manifest).filter(([id,s])=>!s||s.id!==id||!s.path||!Number.isInteger(s.frames)||s.frames<1||!(s.frameWidth>0)||!(s.frameHeight>0)||!(s.rows>=1)||!Number.isFinite(s.visualScale)||s.visualScale<=0||!(s.footprint?.width>0)||!(s.footprint?.height>0)||!s.anchor||!Number.isFinite(s.anchor.x)||!Number.isFinite(s.anchor.y)||s.ports?.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||!p.type));}
