const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function entityAnimationOffset(id){
  const value=String(id??'entity');let hash=2166136261;
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0)/4294967295;
}

export class SpriteAnimator {
  constructor({reduceMotion=()=>false}={}){this.reduceMotion=reduceMotion;}
  fpsFor(entity,definition){
    if(entity?.enabled===false)return 0;
    switch(entity?.type){
      case 'pump':return entity.enabled===false||!(entity.flowRate>0)?0:clamp(2+entity.flowRate*4,2,12);
      case 'fan':case 'exhaust':return entity.enabled===false?0:clamp((entity.currentVelocity||0)*2,0,14);
      case 'tank':return 1.4;
      case 'radiator':return (entity.thermalPower||0)>100?clamp(2+(entity.fanBoost||0)*2,2,8):0;
      case 'exchanger':return Math.abs(entity.thermalPower||0)>100?3:0;
      case 'furnace':return entity.enabled===false?0:5;
      case 'serverRack':return entity.enabled===false?0:clamp(1+(entity.loadMultiplier||0)*2,1,8);
      case 'machine':return entity.enabled===false?0:1.5;
      case 'sensor':return 1;
      case 'coolingUnit':return (entity.currentAirFlow||0)>0?clamp(2+(entity.loadRatio||0)*4,2,8):0;
      default:return definition.fps||0;
    }
  }
  frameFor(entity,definition,gameTime=0){
    if(!definition?.frames||definition.frames<=1||this.reduceMotion())return 0;
    const fps=this.fpsFor(entity,definition);if(fps<=0)return 0;
    return Math.floor((Math.max(0,gameTime)*fps+entityAnimationOffset(entity?.id)*definition.frames)%definition.frames);
  }
}
