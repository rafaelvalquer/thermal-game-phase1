export function technicianAction(entity){
  if(entity.action==='working')return 'working';
  const next=entity.path?.[entity.pathIndex||0];
  const moving=entity.moveProgress>0&&(entity.fromX!==entity.toX||entity.fromY!==entity.toY);
  return ['moving','patrolling'].includes(entity.action)&&(moving||next&&(next.x!==entity.x||next.y!==entity.y))?'walking':'idle';
}
export function technicianState(entity){
  const facing=entity.facing||{x:0,y:1};
  const direction=Math.abs(facing.x)>Math.abs(facing.y)?(facing.x>=0?'east':'west'):(facing.y>=0?'south':'north');
  return `technician-${technicianAction(entity)}-${direction}`;
}
