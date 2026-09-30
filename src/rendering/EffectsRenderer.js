import { isPowered } from '../simulation/PowerState.js';
import { entityAnimationOffset } from './sprites/SpriteAnimator.js';
const AIRFLOW_SOURCES=new Set(['fan','exhaust']);
export class EffectsRenderer {
  draw(ctx,world,tile,mode,time,bounds=null){
    if(mode!=='normal')return;
    this.thermalEffects(ctx,world,tile,time,bounds);this.ambientAir(ctx,world,tile,time,bounds);
  }
  visible(e,tile,bounds){return !bounds||(e.x*tile>=bounds.x-tile*3&&e.y*tile>=bounds.y-tile*3&&e.x*tile<=bounds.x+bounds.width+tile*3&&e.y*tile<=bounds.y+bounds.height+tile*3);}
  thermalEffects(ctx,world,tile,time,bounds=null){
    ctx.save();let budget=120;
    const drawHeat=e=>{
      if(budget<=0)return;
      if(!this.visible(e,tile,bounds))return;
      const t=e.temperature??e.waterTemperature??0;
      const active=(e.isHeatMachine&&t>45)||(e.type==='radiator'&&e.thermalPower>100&&e.waterTemperature>e.airInTemperature);
      if(!active)return;
      const d=e.type==='serverRack'||e.type==='computeRack'?e.airExhaustDirection:{x:0,y:-1};
      for(let k=0;k<3&&budget>0;k++,budget--){
        const phase=(time*.6+k/3+entityAnimationOffset(e.id))%1,side=(k-1)*.17,distance=.55+phase*.8;
        const x=(e.x+.5+d.x*distance-d.y*side)*tile,y=(e.y+.5+d.y*distance+d.x*side)*tile;
        ctx.globalAlpha=(1-phase)*.45;ctx.strokeStyle=t>80?'#e87567':'#e3b657';ctx.lineWidth=Math.max(1,tile/32);ctx.lineCap='butt';
        ctx.beginPath();ctx.moveTo(Math.round(x),Math.round(y));ctx.lineTo(Math.round(x+d.x*tile*.13),Math.round(y+d.y*tile*.13));ctx.stroke();
      }
    };
    const drawSet=set=>{for(const e of set||[]){if(budget<=0)break;drawHeat(e);}};
    // Heat sources and radiators are indexed; avoid scanning all entities.
    if(world.entitySetByType){drawSet(world.heatMachines);drawSet(world.entitySetByType('radiator'));}
    else drawSet(world.entities);
    ctx.restore();
  }
  ambientAir(ctx,world,tile,time,bounds=null){
    ctx.save();let budget=120;
    const drawSource=e=>{
      if(budget<=0||!this.visible(e,tile,bounds)||!isPowered(e))return;
      const fan=AIRFLOW_SOURCES.has(e.type);
      if((fan?(e.currentFlow||0):(e.flowRate||0))<.02)return;
      const d=e.direction||{x:0,y:1};
      for(let k=0;k<3&&budget>0;k++,budget--){const phase=(time*.8+k/3+entityAnimationOffset(e.id))%1,along=e.type==='exhaust'?-(1-phase)*1.4-.3:.55+phase*1.5,side=(k-1)*.16;
        const x=(e.x+.5+d.x*along-d.y*side)*tile,y=(e.y+.5+d.y*along+d.x*side)*tile;
        ctx.globalAlpha=(1-phase)*.65;ctx.fillStyle='#63c6d1';ctx.fillRect(Math.round(x),Math.round(y),Math.max(1,tile/24),Math.max(1,tile/24));}
    };
    const drawSet=set=>{for(const e of set||[])drawSource(e);};
    if(world.entitySetByType){drawSet(world.entitySetByType('fan'));drawSet(world.entitySetByType('exhaust'));drawSet(world.entitySetByType('supplyVent'));}
    else for(const e of world.entities)drawSource(e);
    ctx.restore();
  }
}
