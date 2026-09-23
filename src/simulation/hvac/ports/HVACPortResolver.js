import { HVACPort } from './HVACPort.js';

export class HVACPortResolver {
  airHandler(handler){
    return handler.getPorts().map(port=>new HVACPort({entity:handler,...port,x:handler.x,y:handler.y}));
  }
  condenser(condenser){return new HVACPort({...condenser.refrigerantPort(),x:condenser.x,y:condenser.y});}
  portForCell(entity,x,y,type=null){
    const ports=entity.type==='airHandler'?this.airHandler(entity):entity.type==='condenser'?[this.condenser(entity)]:[];
    return ports.find(port=>(!type||port.type===type)&&port.cell.x===x&&port.cell.y===y)||null;
  }
  compatible(entity,neighborX,neighborY,service){
    if(entity.type==='airHandler')return Boolean(this.portForCell(entity,neighborX,neighborY,service));
    if(entity.type==='condenser')return service==='refrigerant'&&Boolean(this.portForCell(entity,neighborX,neighborY,'refrigerant'));
    if(service==='air')return ['supplyVent','returnVent'].includes(entity.type);
    return false;
  }
}
