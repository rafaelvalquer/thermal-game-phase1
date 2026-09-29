import { technicianAction } from './TechnicianVisualState.js';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const OFF_STATUSES=new Set(['OFF','POWER_OFF','CANCELLED']);
export function entityAnimationOffset(id){
  const value=String(id??'entity');let hash=2166136261;
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0)/4294967295;
}

export class SpriteAnimator {
  constructor({reduceMotion=()=>false}={}){this.reduceMotion=reduceMotion;this.animationOffsets=new WeakMap();}
  animationOffset(entity){let offset=this.animationOffsets.get(entity);if(offset===undefined){offset=entityAnimationOffset(entity.id);this.animationOffsets.set(entity,offset);}return offset;}
  fpsFor(entity,definition){
    if(entity?.enabled===false||entity?.powerBlocked||entity?.started===false||OFF_STATUSES.has(entity?.status))return 0;
    switch(entity?.type){
      case 'pump':return entity.circuitClosed===false||!(entity.flowRate>0)?0:clamp(2+entity.flowRate*4,2,12);
      case 'fan':case 'exhaust':return entity.enabled===false?0:clamp((entity.currentVelocity||0)*2,0,14);
      case 'tank':return entity.flowRate>0?1.4:0;
      case 'radiator':return (entity.thermalPower||0)>100?clamp(2+(entity.fanBoost||0)*2,2,8):0;
      case 'exchanger':return Math.abs(entity.thermalPower||0)>100?3:0;
      case 'furnace':return entity.enabled===false?0:5;
      case 'serverRack':return entity.enabled===false?0:clamp(1+(entity.loadMultiplier||0)*2,1,8);
      case 'machine':return entity.enabled===false?0:1.5;
      case 'sensor':return 1;
      case 'battery':return entity.operationState==='CHARGING'||entity.operationState==='DISCHARGING'?3:0;
      case 'solarPanel':return (entity.generationW||0)>0?clamp(1.5+3.5*entity.generationW/(entity.peakPowerW||10000),1.5,5):0;
      case 'technician':return {working:3,walking:5,idle:0}[technicianAction(entity)];
      case 'coolingUnit':return (entity.currentAirFlow||0)>0?clamp(2+(entity.loadRatio||0)*4,2,8):0;
      case 'supplyVent':return (entity.flowRate||0)>.02?clamp(1+(entity.flowRate||0)*2,1,5):0;
      default:return definition.fps||0;
    }
  }
  frameFor(entity,definition,gameTime=0,fps=this.fpsFor(entity,definition)){
    if(!definition?.frames||definition.frames<=1||this.reduceMotion())return 0;
    if(fps<=0)return 0;
    return Math.floor((Math.max(0,gameTime)*fps+this.animationOffset(entity)*definition.frames)%definition.frames);
  }
}
