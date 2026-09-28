import { SPRITES, spriteIdFor } from './SpriteManifest.js';
import { SpriteManager } from './SpriteManager.js';
import { SpriteAnimator } from './SpriteAnimator.js';
import { SpriteEffects } from './SpriteEffects.js';
import { EquipmentPortRenderer } from './EquipmentPortRenderer.js';
import { resolveVisualRotation } from './SpriteDefinition.js';
import { FLUID_TYPES } from '../VisualTheme.js';
import { VisualSettings } from '../VisualSettings.js';
import { technicianState } from './TechnicianVisualState.js';

export class EquipmentSpriteRenderer {
  constructor({manager=new SpriteManager(),animator=new SpriteAnimator({reduceMotion:()=>VisualSettings.reduceMotion}),effects=new SpriteEffects(),ports=new EquipmentPortRenderer()}={}){
    this.manager=manager;this.animator=animator;this.effects=effects;this.ports=ports;
  }
  preload(){return this.manager.loadAll();}
  isAnimated(entity){return ['pump','radiator','exchanger','fan','exhaust','machine','serverRack','technician','furnace','sensor','coolingUnit','supplyVent','battery'].includes(entity.type);}
  visualFootY(entity){return SPRITES[entity.type]?.anchor?.y??.8;}
  draw(ctx,world,entity,tile,mode,time=0,options={}){
    const id=spriteIdFor(entity),definition=SPRITES[id],image=this.manager.get(id);
    if(!definition||!image)return false;
    const scale=Number.isFinite(entity.visualScale)&&entity.visualScale>0?entity.visualScale:1;
    const industrialLength=entity.type==='coolingUnit'&&entity.tier==='industrial'?(entity.footprintLength||2):1;
    const direction=entity.direction||{x:1,y:0};
    const width=industrialLength>1?tile*industrialLength*scale:tile*(entity.visualWidth||definition.visualWidth||definition.visualScale)*scale;
    const height=industrialLength>1?tile*scale:tile*(entity.visualHeight||definition.visualHeight||definition.visualScale)*scale;
    const anchor=definition.anchor||{x:.5,y:.78},centerX=(entity.x+.5+direction.x*(industrialLength-1)*.5)*tile,centerY=(entity.y+.5+direction.y*(industrialLength-1)*.5)*tile,footY=(entity.y+anchor.y)*tile;
    const x=industrialLength>1?centerX-width*.5:centerX-width*anchor.x,y=industrialLength>1?centerY-height*.5:footY-height*anchor.y;
    if(mode!=='thermal'){
      this.effects.drawShadow(ctx,x,y,width,height);
      this.effects.drawThermalGlow(ctx,entity,x,y,width,height);
    }
    if(FLUID_TYPES.has(entity.type)&&entity.type!=='pipe'){
      // Keep the existing network linework behind the sprite housing.
      if(this.fallback?.equipmentPorts)this.fallback.equipmentPorts(ctx,world,entity,entity.x*tile,entity.y*tile,tile,mode,time);
    }
    const animated=this.isAnimated(entity);
    const frame=animated?this.animator.frameFor(entity,definition,time):0;
    ctx.save();
    if((definition.rotation||industrialLength>1)&&['pump','fan','exhaust','radiator','exchanger','coolingUnit','supplyVent'].includes(entity.type)){
      const angle=entity.type==='supplyVent'?resolveVisualRotation(entity.direction)-Math.PI/2:resolveVisualRotation(entity.direction);
      ctx.translate(centerX,centerY);ctx.rotate(angle);ctx.translate(-centerX,-centerY);
    }
    ctx.imageSmoothingEnabled=false;
    const state=entity.type==='technician'?this.technicianState(entity):entity.powerBlocked?'blocked':entity.enabled===false?'off':this.animator.fpsFor?.(entity,definition)===0?'idle':'running';
    let drawn;
    if(industrialLength>1){
      drawn=this.manager.draw(ctx,id,frame,x,y,width,height,state);
    }else drawn=this.manager.draw(ctx,id,frame,x,y,width,height,state);
    ctx.restore();
    if(!drawn)return false;
    this.ports.draw(ctx,world,entity,definition,tile,mode,options);
    // Selection outlines are drawn in the map overlay; keep the flag for ports,
    // but avoid painting a second outline around the sprite itself.
    this.effects.drawState(ctx,entity,x,y,width,height,time,{...options,selected:false});
    if(entity.type==='serverRack'&&entity.staffBoostRemaining>0){ctx.save();ctx.fillStyle='#7c2d12';ctx.strokeStyle='#fbbf24';ctx.lineWidth=Math.max(1,1.4/((options.zoom)||1));ctx.beginPath();ctx.arc(x+width*.82,y+height*.18,Math.max(4,tile*.16),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fde68a';ctx.font='900 '+Math.max(6,tile*.19)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⚡',x+width*.82,y+height*.18);ctx.restore();}
    return true;
  }
  technicianState(entity){return technicianState(entity);}
}
