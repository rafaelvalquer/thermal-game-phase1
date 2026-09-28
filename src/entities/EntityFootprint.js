export function entityFootprintCells(entity){
  const length=Math.max(1,Math.floor(entity?.footprintLength||(entity?.type==='coolingUnit'&&entity?.tier==='industrial'?2:1)));
  const direction=entity?.direction||{x:1,y:0};
  const dx=Math.sign(direction.x||0),dy=Math.sign(direction.y||0);
  const axisX=dx||(!dy?1:0),axisY=dy;
  return Array.from({length},(_,offset)=>({x:entity.x+axisX*offset,y:entity.y+axisY*offset}));
}
