import { clamp, rgbHeat } from '../utils/MathUtils.js';

export const FLUID_TYPES = new Set(['pipe','pump','tank','radiator','exchanger']);

export const thermalState = (temperature) => {
  if (temperature >= 80) return { id:'critical', label:'CRÍTICO', color:'#ef4444', glow:1 };
  if (temperature >= 60) return { id:'danger', label:'SUPERAQUECENDO', color:'#fb7185', glow:.82 };
  if (temperature >= 45) return { id:'hot', label:'QUENTE', color:'#f59e0b', glow:.58 };
  if (temperature >= 30) return { id:'warm', label:'AQUECENDO', color:'#fbbf24', glow:.3 };
  return { id:'stable', label:'ESTÁVEL', color:'#34d399', glow:0 };
};

export const heatCss = (temperature, alpha=1,min=10,max=80) => {
  const [r,g,b]=rgbHeat(temperature,min,max);
  return 'rgba('+r+','+g+','+b+','+alpha+')';
};

export const waterCss = (temperature, alpha=1) => {
  const t=clamp((temperature-15)/55,0,1);
  const stops=[
    [0,[37,99,235]],
    [.32,[34,211,238]],
    [.58,[45,212,191]],
    [.78,[250,204,21]],
    [1,[249,115,22]],
  ];
  for(let i=0;i<stops.length-1;i++){
    const a=stops[i],b=stops[i+1];
    if(t>=a[0]&&t<=b[0]){
      const f=(t-a[0])/(b[0]-a[0]);
      const c=a[1].map((v,k)=>Math.round(v+(b[1][k]-v)*f));
      return 'rgba('+c[0]+','+c[1]+','+c[2]+','+alpha+')';
    }
  }
  return 'rgba(249,115,22,'+alpha+')';
};

export const dirAngle = (direction) => Math.atan2(direction.y,direction.x);
export const dirGlyph = (direction) => direction.x>0?'→':direction.x<0?'←':direction.y>0?'↓':'↑';

export const entityLabel = (type) => ({
  machine:'Máquina industrial',
  serverRack:'Rack de servidores',
  furnace:'Forno industrial',
  passiveHeat:'Fonte térmica passiva',
  fan:'Ventilador',
  exhaust:'Exaustor',
  pipe:'Tubulação',
  pump:'Bomba',
  tank:'Tanque térmico',
  radiator:'Radiador',
  exchanger:'Trocador de calor',
  sensor:'Sensor térmico',
}[type]||type);
