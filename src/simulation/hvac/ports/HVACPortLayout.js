export const HVAC_PORT_LAYOUT = Object.freeze({
  airHandler: Object.freeze({
    supply: Object.freeze({x:-1,y:0,color:'#38bdf8'}),
    return: Object.freeze({x:1,y:0,color:'#fb923c'}),
    refrigerant: Object.freeze({x:0,y:1,color:'#c084fc'}),
  }),
  condenser: Object.freeze({
    refrigerant: Object.freeze({x:0,y:-1,color:'#c084fc'}),
  }),
});

export function portDirection({x,y}){
  if(x<0)return 'left';
  if(x>0)return 'right';
  return y<0?'up':'down';
}
