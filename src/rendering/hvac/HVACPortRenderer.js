import { HVACPortResolver } from '../../simulation/hvac/ports/HVACPortResolver.js';

const labels={supply:'SUP',return:'RET',refrigerant:'REF'};

export class HVACPortRenderer {
  constructor(){this.resolver=new HVACPortResolver();}
  draw(ctx,world,tile,zoom=1){
    for(const handler of world.entitiesByType('airHandler'))for(const port of this.resolver.airHandler(handler))this.port(ctx,port,tile,zoom);
    for(const condenser of world.entitiesByType('condenser'))this.port(ctx,this.resolver.condenser(condenser),tile,zoom);
    this.invalidLinks(ctx,world,tile,zoom);
  }
  port(ctx,port,tile,zoom){
    const p=port.cell,x=(p.x+.5)*tile,y=(p.y+.5)*tile;
    ctx.save();ctx.fillStyle='#07111f';ctx.strokeStyle=port.color;ctx.lineWidth=Math.max(1,1.7/zoom);ctx.beginPath();ctx.arc(x,y,tile*.2,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.fillStyle=port.color;ctx.font='900 '+Math.max(6,tile*.18)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(labels[port.type],x,y);ctx.restore();
  }
  invalidLinks(ctx,world,tile,zoom){
    const marks=[];
    for(const duct of world.allUtilities().filter(item=>['smallDuct','mediumDuct','largeDuct'].includes(item.type)))for(const entity of world.entities){
      if(entity.type==='condenser'&&Math.abs(entity.x-duct.x)+Math.abs(entity.y-duct.y)===1)marks.push({x:(entity.x+duct.x+1)/2,y:(entity.y+duct.y+1)/2});
      if(entity.type==='airHandler'&&Math.abs(entity.x-duct.x)+Math.abs(entity.y-duct.y)===1&&!['supply','return'].some(service=>this.resolver.portForCell(entity,duct.x,duct.y,service)))marks.push({x:(entity.x+duct.x+1)/2,y:(entity.y+duct.y+1)/2});
    }
    for(const line of world.allUtilities().filter(item=>item.type==='refrigerantLine'))for(const entity of world.entities){
      if(['supplyVent','returnVent'].includes(entity.type)&&Math.abs(entity.x-line.x)+Math.abs(entity.y-line.y)===1)marks.push({x:(entity.x+line.x+1)/2,y:(entity.y+line.y+1)/2});
    }
    for(const mark of marks){const x=mark.x*tile,y=mark.y*tile,r=tile*.11;ctx.save();ctx.strokeStyle='#ef4444';ctx.lineWidth=Math.max(1.5,2/zoom);ctx.beginPath();ctx.moveTo(x-r,y-r);ctx.lineTo(x+r,y+r);ctx.moveTo(x+r,y-r);ctx.lineTo(x-r,y+r);ctx.stroke();ctx.restore();}
  }
}
