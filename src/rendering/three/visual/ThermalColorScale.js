import { Color } from 'three';

const STOPS=[{value:18,color:new Color('#168aad')},{value:24,color:new Color('#34d399')},{value:30,color:new Color('#facc15')},{value:36,color:new Color('#f97316')},{value:42,color:new Color('#dc2626')}];
export class ThermalColorScale {
  static colorAt(temperature,target=new Color()){
    const t=Number(temperature)||0;
    if(t<=STOPS[0].value)return target.set(STOPS[0].color);
    for(let i=1;i<STOPS.length;i++)if(t<=STOPS[i].value){const a=STOPS[i-1],b=STOPS[i],mix=(t-a.value)/(b.value-a.value);return target.copy(a.color).lerp(b.color,mix);}
    return target.copy(STOPS.at(-1).color);
  }
}
