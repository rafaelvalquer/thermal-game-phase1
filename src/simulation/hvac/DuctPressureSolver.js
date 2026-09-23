import { HVAC } from './HVACConstants.js';

export class DuctPressureSolver {
  pathResistance(path){
    let resistance=0,previousPosition=null,previousDirection=null;
    for(const node of path){
      if(node.kind==='duct'){
        const duct=node.entity,damper=duct.world?.utilityAt?.(duct.x,duct.y,'ductDamper');
        resistance+=(duct.baseResistance||1)*HVAC.tileLength;
        if(damper){damper.resistance=damper.opening<=0?Infinity:((1-damper.opening)**2*120+1);resistance+=damper.resistance;}
        if(previousPosition){
          const direction={x:node.entity.x-previousPosition.x,y:node.entity.y-previousPosition.y};
          if(previousDirection&&(direction.x!==previousDirection.x||direction.y!==previousDirection.y))resistance+=2.5;
          previousDirection=direction;
        }
        previousPosition=node.entity;
      }else if(previousPosition){
        const direction={x:node.entity.x-previousPosition.x,y:node.entity.y-previousPosition.y};
        if(previousDirection&&(direction.x!==previousDirection.x||direction.y!==previousDirection.y))resistance+=2.5;
        previousDirection=direction;
      }
    }
    return Math.max(.2,resistance);
  }

  equivalentResistance(resistances){
    const conductance=resistances.filter(value=>Number.isFinite(value)&&value>0).reduce((sum,value)=>sum+1/Math.sqrt(value),0);
    return conductance>0?1/(conductance*conductance):Infinity;
  }

  availableFlow(resistances,maxFlow){
    const equivalent=this.equivalentResistance(resistances);
    return Number.isFinite(equivalent)?Math.min(maxFlow,Math.sqrt(HVAC.referencePressure/equivalent)):0;
  }
}
