import { SPRITES, SPRITE_ENTITY_TYPES } from './SpriteManifest.js';
import { SpriteManager } from './SpriteManager.js';
import { SpriteAnimator } from './SpriteAnimator.js';
import { SpriteEffects } from './SpriteEffects.js';
import { EquipmentPortRenderer } from './EquipmentPortRenderer.js';
import { resolveVisualRotation } from './SpriteDefinition.js';
import { FLUID_TYPES } from '../VisualTheme.js';
import { VisualSettings } from '../VisualSettings.js';

export class EquipmentSpriteRenderer {
  constructor({manager=new SpriteManager(),animator=new SpriteAnimator({reduceMotion:()=>VisualSettings.reduceMotion}),effects=new SpriteEffects(),ports=new EquipmentPortRenderer()}={}){
    this.manager=manager;this.animator=animator;this.effects=effects;this.ports=ports;
  }
  preload(){return this.manager.loadAll();}
  isAnimated(entity){return ['pump','radiator','exchanger','fan','exhaust','machine','serverRack','furnace','sensor','airHandler','condenser'].includes(entity.type);}
  visualFootY(entity){return SPRITES[entity.type]?.anchor?.y??.8;}
  draw(ctx,world,entity,tile,mode,time=0,options={}){
    const id=SPRITE_ENTITY_TYPES[entity.type],definition=SPRITES[id],image=this.manager.get(id);
    if(!definition||!image)return false;
    const scale=Number.isFinite(entity.visualScale)&&entity.visualScale>0?entity.visualScale:1;
    const width=tile*(entity.visualWidth||definition.visualWidth||definition.visualScale)*scale;
    const height=tile*(entity.visualHeight||definition.visualHeight||definition.visualScale)*scale;
    const anchor=definition.anchor||{x:.5,y:.78},centerX=(entity.x+.5)*tile,footY=(entity.y+anchor.y)*tile;
    const x=centerX-width*anchor.x,y=footY-height*anchor.y;
    this.effects.drawShadow(ctx,x,y,width,height);
    this.effects.drawThermalGlow(ctx,entity,x,y,width,height);
    if(FLUID_TYPES.has(entity.type)&&entity.type!=='pipe'){
      // Keep the existing network linework behind the sprite housing.
      if(this.fallback?.equipmentPorts)this.fallback.equipmentPorts(ctx,world,entity,entity.x*tile,entity.y*tile,tile,mode,time);
    }
    const animated=this.isAnimated(entity);
    const frame=animated?this.animator.frameFor(entity,definition,time):0;
    ctx.save();
    if(definition.rotation&&['pump','fan','exhaust','radiator','exchanger','airHandler','condenser'].includes(entity.type)){
      ctx.translate(centerX,(entity.y+.5)*tile);ctx.rotate(resolveVisualRotation(entity.direction));ctx.translate(-centerX,-(entity.y+.5)*tile);
    }
    ctx.imageSmoothingEnabled=true;if('imageSmoothingQuality'in ctx)ctx.imageSmoothingQuality='high';
    const drawn=this.manager.draw(ctx,id,frame,x,y,width,height);ctx.restore();
    if(!drawn)return false;
    this.ports.draw(ctx,world,entity,definition,tile,mode,options);
    // Selection outlines are drawn in the map overlay; keep the flag for ports,
    // but avoid painting a second outline around the sprite itself.
    this.effects.drawState(ctx,entity,x,y,width,height,time,{...options,selected:false});
    return true;
  }
}
