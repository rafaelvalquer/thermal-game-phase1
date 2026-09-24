export const UTILITY_COMPATIBILITY=Object.freeze({duct:Object.freeze({duct:false})});
export function utilityCanShareTile(type,existing){return type==='duct'&&!existing.some(item=>item.type==='duct');}
