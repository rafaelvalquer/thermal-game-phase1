export function relativeScalingGate(measurements,limit=2.5){
  const ratios=[];
  for(let index=1;index<measurements.length;index++){
    const previous=measurements[index-1],current=measurements[index],ratio=current.averageMsPerTick/Math.max(.001,previous.averageMsPerTick);
    ratios.push({from:previous.scenario,to:current.scenario,ratio:Number(ratio.toFixed(2))});
  }
  return {limit,ratios,failed:ratios.filter(item=>item.ratio>limit)};
}
