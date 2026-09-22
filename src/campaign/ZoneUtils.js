export const zoneContains=(zone,x,y)=>x>=zone.x&&y>=zone.y&&x<zone.x+zone.width&&y<zone.y+zone.height;

export const zoneStats=(world,zone)=>{
  let sum=0,max=-Infinity,count=0,airflow=0;
  for(let y=zone.y;y<zone.y+zone.height;y++)for(let x=zone.x;x<zone.x+zone.width;x++){
    if(!world.inBounds(x,y)||!world.isAir(x,y))continue;
    const t=world.temperatureAt(x,y),i=world.index(x,y);
    sum+=t;max=Math.max(max,t);airflow+=Math.hypot(world.airX[i],world.airY[i]);count++;
  }
  return {average:count?sum/count:0,max:count?max:0,airflow:count?airflow/count:0,count};
};

export const entityMatches=(entity,filter={})=>{
  if(filter.type&&entity.type!==filter.type)return false;
  if(filter.category&&entity.category!==filter.category)return false;
  if(filter.zoneId&&entity.zoneId!==filter.zoneId)return false;
  if(filter.missionId&&entity.missionId!==filter.missionId)return false;
  if(filter.heatMachine&& !entity.isHeatMachine)return false;
  return true;
};
