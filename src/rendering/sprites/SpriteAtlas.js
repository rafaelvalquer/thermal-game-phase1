import { SPRITES } from './SpriteManifest.js';

export class SpriteAtlas {
  constructor(definitions=SPRITES){this.definitions=definitions;}
  get(id){return this.definitions[id]||null;}
  sourceRect(id,frame=0){
    const sprite=this.get(id);if(!sprite)return null;
    const index=((Math.floor(frame)%sprite.frames)+sprite.frames)%sprite.frames;
    const columns=Math.max(1,sprite.framesPerRow||sprite.frames),
      origin=sprite.atlasRect||{x:0,y:0};
    return {x:origin.x+(index%columns)*sprite.frameWidth,y:origin.y+Math.floor(index/columns)*sprite.frameHeight,
      width:sprite.frameWidth,height:sprite.frameHeight};
  }
}
