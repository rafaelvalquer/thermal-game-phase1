import { rotatePort } from './SpriteDefinition.js';
import { FLUID_TYPES } from '../VisualTheme.js';

export class EquipmentPortRenderer {
  draw(ctx,world,entity,definition,tile,mode='normal',options={}){
    if(!definition?.ports?.length)return;
    const angle=Math.atan2(entity.direction?.y||0,entity.direction?.x??1);
    const centerX=(entity.x+.5)*tile,centerY=(entity.y+.5)*tile;
    ctx.save();ctx.lineCap='round';ctx.lineWidth=Math.max(1,tile*.055);
    for(const port of definition.ports){
      const visual=rotatePort(port,angle),dx=Math.round(Math.cos(Math.atan2(portVector(port,angle).y,portVector(port,angle).x)));
      const dy=Math.round(Math.sin(Math.atan2(portVector(port,angle).y,portVector(port,angle).x)));
      const neighbor=world?.entityAt?.(entity.x+dx,entity.y+dy);
      const isFluidPort=port.type==='fluid';
      const showPort=isFluidPort
        ? Boolean(neighbor&&FLUID_TYPES.has(neighbor.type))
        : options.selected;
      if(!showPort)continue;
      const px=centerX+(visual.x-.5)*tile,py=centerY+(visual.y-.5)*tile;
      const edgeX=centerX+dx*tile*.47,edgeY=centerY+dy*tile*.47;
      const color=port.color|| (port.service==='return'?'#fb923c':port.service==='refrigerant'?'#c084fc':'#38bdf8');
      ctx.strokeStyle='#07111d';ctx.lineWidth=Math.max(2,tile*.13);ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(edgeX,edgeY);ctx.stroke();
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.2,tile*.055);ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(edgeX,edgeY);ctx.stroke();
      ctx.fillStyle='#07111d';ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,tile*.035);
      ctx.beginPath();ctx.arc(edgeX,edgeY,tile*.09,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    ctx.restore();
  }
  visualPort(port,rotation){return rotatePort(port,rotation);}
}

function portVector(port,angle){
  const base=({right:[1,0],down:[0,1],left:[-1,0],up:[0,-1]})[port.direction]||[port.x-.5,port.y-.5];
  return {x:base[0]*Math.cos(angle)-base[1]*Math.sin(angle),y:base[0]*Math.sin(angle)+base[1]*Math.cos(angle)};
}
