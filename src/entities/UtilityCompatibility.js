const AIR_DUCTS=new Set(['smallDuct','mediumDuct','largeDuct']);
export const UTILITY_COMPATIBILITY=Object.freeze({
  airDuct:Object.freeze({airDuct:false,refrigerantLine:true,ductDamper:true}),
  refrigerantLine:Object.freeze({airDuct:true,refrigerantLine:false,ductDamper:'requires-air-duct'}),
  ductDamper:Object.freeze({airDuct:true,refrigerantLine:'requires-air-duct',ductDamper:false}),
});

const family=type=>AIR_DUCTS.has(type)?'airDuct':type==='refrigerantLine'?'refrigerantLine':type==='ductDamper'?'ductDamper':type;

export function utilityCanShareTile(type,existing){
  const typeFamily=family(type),others=existing.map(item=>family(item.type));
  if(!UTILITY_COMPATIBILITY[typeFamily]||others.some(other=>!UTILITY_COMPATIBILITY[other]))return false;
  if(others.includes(typeFamily)||others.some(other=>UTILITY_COMPATIBILITY[typeFamily][other]===false))return false;
  const allFamilies=new Set([...others,typeFamily]);
  for(const other of others){
    const rule=UTILITY_COMPATIBILITY[typeFamily][other];
    const reciprocal=UTILITY_COMPATIBILITY[other][typeFamily];
    if(rule===false||reciprocal===false)return false;
    if(rule==='requires-air-duct'||reciprocal==='requires-air-duct')if(!allFamilies.has('airDuct'))return false;
  }
  return !allFamilies.has('ductDamper')||allFamilies.has('airDuct');
}
