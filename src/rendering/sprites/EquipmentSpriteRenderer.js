import { SPRITES, spriteIdFor } from './SpriteManifest.js';
import { SpriteManager } from './SpriteManager.js';
import { SpriteAnimator } from './SpriteAnimator.js';
import { SpriteEffects } from './SpriteEffects.js';
import { EquipmentPortRenderer } from './EquipmentPortRenderer.js';
import { resolveVisualRotation, resolveSpriteState } from './SpriteDefinition.js';
import { FLUID_TYPES } from '../VisualTheme.js';
import { VisualSettings } from '../VisualSettings.js';
import { technicianState } from './TechnicianVisualState.js';

const ANIMATED_TYPES=new Set(['pump','radiator','exchanger','waterChiller','fan','exhaust','machine','serverRack','computeRack','technician','furnace','sensor','coolingUnit','supplyVent','battery','solarPanel']);
const ROTATING_TYPES=new Set(['pump','fan','exhaust','radiator','exchanger','coolingUnit','supplyVent']);

export class EquipmentSpriteRenderer {
  constructor({manager=new SpriteManager(),animator=new SpriteAnimator({reduceMotion:()=>VisualSettings.reduceMotion}),effects=new SpriteEffects(),ports=new EquipmentPortRenderer(),CanvasClass=globalThis.OffscreenCanvas,compositeLimit=192}={}){
    this.manager=manager;this.animator=animator;this.effects=effects;this.ports=ports;this.CanvasClass=CanvasClass;this.compositeLimit=Math.max(1,compositeLimit|0);this.compositeFrames=new Map();
  }
  preload(){return this.manager.loadAll();}
  isAnimated(entity){return ANIMATED_TYPES.has(entity.type);}
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
    const animated=this.isAnimated(entity),animationFps=animated?this.animator.fpsFor?.(entity,definition):0;
    const frame=animated?this.animator.frameFor(entity,definition,time,animationFps):0;
    const state=entity.type==='technician'?this.technicianState(entity):entity.powerBlocked?'blocked':entity.enabled===false?'off':animationFps===0?'idle':'running';
    const fluidHousing=FLUID_TYPES.has(entity.type)&&entity.type!=='pipe';
    const composite=this.compositeFrame({id,frame,state,entity,definition,mode,time,options,includeAmbient:!fluidHousing});
    if(fluidHousing||!composite){if(mode!=='thermal'){this.effects.drawShadow(ctx,x,y,width,height);this.effects.drawThermalGlow(ctx,entity,x,y,width,height);}}
    if(fluidHousing){
      // Keep the existing network linework behind the sprite housing.
      if(this.fallback?.equipmentPorts)this.fallback.equipmentPorts(ctx,world,entity,entity.x*tile,entity.y*tile,tile,mode,time);
    }
    const rotate=(definition.rotation||industrialLength>1)&&ROTATING_TYPES.has(entity.type);
    if(rotate){
      ctx.save();
      const angle=entity.type==='supplyVent'?resolveVisualRotation(entity.direction)-Math.PI/2:resolveVisualRotation(entity.direction);
      ctx.translate(centerX,centerY);ctx.rotate(angle);ctx.translate(-centerX,-centerY);
    }
    let drawn;
    if(composite){ctx.imageSmoothingEnabled=false;ctx.drawImage(composite,x,y,width,height);drawn=true;}
    else {ctx.imageSmoothingEnabled=false;drawn=this.manager.draw(ctx,id,frame,x,y,width,height,state);}
    if(rotate)ctx.restore();
    if(!drawn)return false;
    this.ports.draw(ctx,world,entity,definition,tile,mode,options);
    // Selection outlines are drawn in the map overlay; keep the flag for ports,
    // but avoid painting a second outline around the sprite itself.
    if(!composite)this.effects.drawState(ctx,entity,x,y,width,height,time,{...options,selected:false});
    if(entity.type==='serverRack'&&entity.staffBoostRemaining>0){ctx.save();ctx.fillStyle='#7c2d12';ctx.strokeStyle='#fbbf24';ctx.lineWidth=Math.max(1,1.4/((options.zoom)||1));ctx.beginPath();ctx.arc(x+width*.82,y+height*.18,Math.max(4,tile*.16),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fde68a';ctx.font='900 '+Math.max(6,tile*.19)+'px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('⚡',x+width*.82,y+height*.18);ctx.restore();}
    return true;
  }
  compositeFrame({id,frame,state,entity,definition,mode,time,options,includeAmbient=true}){
    const thermal=mode==='thermal',temperature=entity.temperature??entity.waterTemperature??0;
    const glow=!includeAmbient||thermal||temperature<55?0:temperature>=80?2:1;
    const preview=Boolean(options.preview),selected=false,valid=options.valid!==false,powerBlocked=Boolean(entity.powerBlocked),visualState=resolveSpriteState(entity);
    const key=[id,frame,state,visualState,thermal?1:0,glow,preview?1:0,selected?1:0,valid?1:0,powerBlocked?1:0].join(':');
    const cached=this.compositeFrames.get(key);if(cached)return cached;
    let canvas=null;
    if(typeof this.CanvasClass==='function')canvas=new this.CanvasClass(definition.frameWidth,definition.frameHeight);
    else if(typeof document!=='undefined')canvas=document.createElement('canvas');
    if(!canvas)return null;
    canvas.width=definition.frameWidth;canvas.height=definition.frameHeight;
    const target=canvas.getContext?.('2d');if(!target)return null;
    target.imageSmoothingEnabled=false;target.clearRect(0,0,canvas.width,canvas.height);
    if(includeAmbient&&!thermal){this.effects.drawShadow(target,0,0,canvas.width,canvas.height);if(glow){target.fillStyle=glow===2?'#e8756722':'#e3b65718';target.fillRect(canvas.width*.15,canvas.height*.25,canvas.width*.72,canvas.height*.6);}}
    if(!this.manager.draw(target,id,frame,0,0,canvas.width,canvas.height,state))return null;
    this.effects.drawState(target,entity,0,0,canvas.width,canvas.height,time,{...options,selected:false});
    this.compositeFrames.set(key,canvas);
    if(this.compositeFrames.size>this.compositeLimit)this.compositeFrames.delete(this.compositeFrames.keys().next().value);
    return canvas;
  }
  technicianState(entity){return technicianState(entity);}
}
