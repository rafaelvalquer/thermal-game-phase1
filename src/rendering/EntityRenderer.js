import { rgbHeat } from '../utils/MathUtils.js';
const FLUID=new Set(['pipe','pump','tank','radiator','exchanger']);
export class EntityRenderer {
  draw(ctx,world,tile,mode){for(const e of world.entities){const x=e.x*tile,y=e.y*tile,cx=x+tile/2,cy=y+tile/2;ctx.save();
    if(e.type==='machine')this.machine(ctx,e,x,y,tile);
    else if(e.type==='fan'||e.type==='exhaust')this.fan(ctx,e,cx,cy,tile);
    else if(FLUID.has(e.type))this.fluid(ctx,e,x,y,tile,mode);
    else if(e.type==='sensor')this.sensor(ctx,e,cx,cy,tile);
    ctx.restore();}}
  machine(ctx,e,x,y,tile){const [r,g,b]=rgbHeat(e.temperature);ctx.fillStyle='#262b35';ctx.strokeStyle=`rgb(${r},${g},${b})`;ctx.lineWidth=2;ctx.fillRect(x+1,y+1,tile-2,tile-2);ctx.strokeRect(x+1,y+1,tile-2,tile-2);ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(7,tile*.46)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e.name.replace('Máquina ','M'),x+tile/2,y+tile/2);}
  fan(ctx,e,cx,cy,tile){ctx.translate(cx,cy);ctx.rotate(Math.atan2(e.direction.y,e.direction.x));ctx.fillStyle=e.type==='exhaust'?'#fb7185':'#67e8f9';ctx.beginPath();ctx.moveTo(tile*.38,0);ctx.lineTo(-tile*.28,-tile*.28);ctx.lineTo(-tile*.18,0);ctx.lineTo(-tile*.28,tile*.28);ctx.closePath();ctx.fill();}
  fluid(ctx,e,x,y,tile,mode){const t=e.waterTemperature;const [r,g,b]=rgbHeat(t);ctx.fillStyle=mode==='fluid'?`rgb(${r},${g},${b})`:'#3b82f6';if(e.type==='pipe'){ctx.fillRect(x+tile*.08,y+tile*.38,tile*.84,tile*.24);}else{ctx.fillRect(x+2,y+2,tile-4,tile-4);ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(7,tile*.5)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText({pump:'P',tank:'T',radiator:'R',exchanger:'X'}[e.type],x+tile/2,y+tile/2);} }
  sensor(ctx,e,cx,cy,tile){ctx.fillStyle='#fde047';ctx.beginPath();ctx.arc(cx,cy,tile*.28,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111827';ctx.font=`bold ${Math.max(6,tile*.42)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('S',cx,cy);}
}
