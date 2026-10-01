const byType=(world,type)=>world.entitySetByType?.(type)||world.entitiesByType?.(type)||world.entities?.filter(rack=>rack.type===type)||[];

/** All installed rack hardware, including both Colocation and Cloud Compute. */
export function operationalRacks(world){return [...byType(world,'serverRack'),...byType(world,'computeRack')];}

/** Racks that still belong to an active physical installation. */
export function serviceableRacks(world){return operationalRacks(world).filter(rack=>rack.status!=='CANCELLED'&&rack.status!=='DECOMMISSIONED');}

export function hotRacks(world,{minimumTemperature=35}={}){
  return serviceableRacks(world).filter(rack=>Number(rack.temperature)>Math.max(minimumTemperature,Number(rack.slaTemperature)||minimumTemperature)&&!(rack.staffBoostRemaining>0));
}
