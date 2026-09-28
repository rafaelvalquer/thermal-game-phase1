// Operator intent (enabled) is independent of electrical protection.
export const isPowered=(entity,ignorePowerBlock=false)=>Boolean(entity.enabled)&&(ignorePowerBlock||!entity.powerBlocked);
export const powerEquipment=world=>[...new Set([...world.entities,...world.allUtilities()])];
