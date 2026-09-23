const keyOf=({x,y})=>`${x},${y}`;

export function pipePathBetween(from,to){
  const path=[];
  let x=from.x,y=from.y;
  const dx=Math.sign(to.x-x),dy=Math.sign(to.y-y);
  while(x!==to.x){x+=dx;path.push({x,y});}
  while(y!==to.y){y+=dy;path.push({x,y});}
  return path;
}

export function extendPipePath(path,to){
  if(!path.length)return [{x:to.x,y:to.y}];
  const next=pipePathBetween(path[path.length-1],to);
  const seen=new Set(path.map(keyOf));
  return path.concat(next.filter(point=>!seen.has(keyOf(point))));
}
