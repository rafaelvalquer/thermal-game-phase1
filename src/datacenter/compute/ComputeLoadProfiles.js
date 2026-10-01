const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const hash=value=>{let result=2166136261;for(const char of String(value??'')){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}return result>>>0;};

export const COMPUTE_LOAD_PROFILE_LABELS=Object.freeze({business:'Business',streaming:'Streaming',ai:'AI',storage:'Storage',constant:'Constant'});
const CURVES={
  business:[[0,.24],[6,.27],[9,.55],[12,.78],[14,.89],[16,.85],[17,.72],[21,.47],[24,.24]],
  streaming:[[0,.60],[4,.36],[6,.25],[11,.23],[12,.34],[17,.45],[19,.7],[21,.9],[22,.94],[23,.72],[24,.60]],
  storage:[[0,.29],[1,.43],[2,.55],[4,.46],[5,.31],[8,.25],[16,.27],[20,.31],[24,.29]],
};

function interpolate(points,hour){
  const h=((hour%24)+24)%24;
  let index=1;while(index<points.length&&h>points[index][0])index++;
  const [x0,y0]=points[index-1],[x1,y1]=points[Math.min(index,points.length-1)],t=smooth((h-x0)/Math.max(1e-9,x1-x0));
  return y0+(y1-y0)*t;
}
function variation(contractId){const seed=hash(contractId);return {phase:((seed%2001)/1000-1),amplitude:.9+((seed>>>11)%2001)/10000};}
function variedCurve(profile,hour,contractId){
  const {phase,amplitude}=variation(contractId),base=interpolate(CURVES[profile],hour+phase);
  return clamp(.5+(base-.5)*amplitude);
}
function aiDemand(hour,day,contractId){
  const seed=hash(`${contractId}:${Math.floor(day)||1}`),cycleHours=5+(seed%5),phase=((seed>>>8)%10000)/10000*cycleHours;
  const cycle=((hour+phase)%cycleHours+cycleHours)%cycleHours,busy=.8+((seed>>>18)%6000)/10000;
  const ramp=1.2+((seed>>>20)%60)/100;
  const trough=.38+((seed>>>24)%1200)/10000,peak=.93+((seed>>>12)%700)/10000;
  const intensity=cycle<ramp?smooth(cycle/ramp):cycle<ramp+busy?1:cycle<ramp+busy+ramp?1-smooth((cycle-ramp-busy)/ramp):0;
  return clamp(trough+(peak-trough)*intensity);
}

export function computeLoadDemand(profile,hour=0,day=1,contractId=''){
  const name=COMPUTE_LOAD_PROFILE_LABELS[profile]?profile:'constant',h=Number(hour)||0,d=Number(day)||1;
  if(name==='ai')return aiDemand(h,d,contractId);
  if(name==='constant'){
    const {phase}=variation(contractId),dayPhase=(hash(`${contractId}:${Math.floor(d)}`)%1000)/1000*Math.PI*2;
    return clamp(.5+.025*Math.sin((h+phase)*Math.PI/12+dayPhase));
  }
  return variedCurve(name,h,contractId);
}

export function nextComputeLoadPeak(profile,hour=0,day=1,contractId=''){
  if(profile==='constant')return null;
  let peak={value:-Infinity,hour:hour,day};
  for(let step=1;step<=96;step++){
    const absolute=hour+step*.25,nextDay=day+Math.floor(absolute/24),nextHour=absolute%24;
    const value=computeLoadDemand(profile,nextHour,nextDay,contractId);
    if(value>peak.value)peak={value,hour:nextHour,day:nextDay};
  }
  return peak;
}
