export function getVisualState(entity){
  if(entity?.enabled===false)return 'off';
  if(entity?.powerBlocked)return 'critical';
  const status=String(entity?.status||'').toUpperCase();
  if(['OVERLOAD','OVERHEAT','FAULT'].includes(status)||entity?.critical)return 'critical';
  if(status==='CANCELLED'||status==='OFF'||status==='POWER_OFF')return 'off';
  if(['HOT','WARNING','HIGH RESISTANCE','RESTRICTED'].includes(status)||entity?.warning)return 'warning';
  const networkStatus=String(entity?.networkStatus||'').toUpperCase();
  if(networkStatus&&networkStatus!=='READY'&&networkStatus!=='CLOSED')return 'critical';
  const threshold=entity?.failureTemperature??entity?.overheatThreshold??80;
  const temp=entity?.temperature??entity?.current??entity?.waterTemperature??-Infinity;
  if(temp>=threshold)return 'critical';
  if(status==='HIGH HEAD')return 'critical';
  if(temp>=threshold*.85)return 'warning';
  const active=entity?.type==='pump'?(entity.circuitClosed&&entity.flowRate>.02)
    :['fan','exhaust'].includes(entity?.type)?(entity.currentVelocity||0)>.04
    :entity?.type==='radiator'?(entity.thermalPower||0)>100
    :entity?.type==='exchanger'?Math.abs(entity.thermalPower||0)>100
    :entity?.type==='supplyVent'?(entity.flowRate||0)>.02
    :entity?.type==='tank'?true
    :entity?.type==='sensor'?true
    :entity?.type==='furnace'?entity.started!==false
    :entity?.type==='serverRack'?(entity.loadMultiplier||0)>0
    :entity?.started!==false;
  return active?'running':'idle';
}
export const resolveSpriteState=getVisualState;

export function resolveVisualRotation(direction={x:1,y:0}){
  return Math.atan2(direction?.y||0,direction?.x??1);
}

export function rotatePort(port,rotation=0){
  let x=port.x-.5,y=port.y-.5;
  const turns=((Math.round(rotation/(Math.PI/2))%4)+4)%4;
  for(let i=0;i<turns;i++)[x,y]=[-y,x];
  const vectors={right:[1,0],down:[0,1],left:[-1,0],up:[0,-1]};
  let direction=port.direction;
  if(vectors[direction]){
    let [dx,dy]=vectors[direction];for(let i=0;i<turns;i++)[dx,dy]=[-dy,dx];
    direction=Object.entries(vectors).find(([,vector])=>vector[0]===dx&&vector[1]===dy)?.[0]||direction;
  }
  return {...port,x:x+.5,y:y+.5,direction};
}
