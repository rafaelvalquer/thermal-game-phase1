export class Minimap {
  constructor(canvas,game){this.canvas=canvas;this.game=game;this.ctx=canvas?.getContext('2d');this.timer=0;}
  update(dt=0){
    if(!this.canvas||!this.ctx)return;
    const level=this.game.level;if(!level.datacenterSandbox&&level.number<4){this.canvas.parentElement?.classList.add('hidden');return;}
    this.timer+=dt;if(this.timer<.2)return;this.timer=0;this.draw();
  }
  draw(){
    const c=this.canvas,ctx=this.ctx,w=this.game.world,r=c.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),W=Math.max(40,Math.floor(r.width*dpr)),H=Math.max(40,Math.floor(r.height*dpr));
    if(c.width!==W||c.height!==H){c.width=W;c.height=H;}ctx.setTransform(dpr,0,0,dpr,0,0);
    const width=W/dpr,height=H/dpr,sx=width/w.width,sy=height/w.height;
    ctx.fillStyle='#030712';ctx.fillRect(0,0,width,height);
    for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++){
      const m=w.materialAt(x,y);if(m.id==='air')continue;
      ctx.fillStyle=m.id==='insulation'?'#a39158':m.id==='copper'?'#b86132':'#475569';ctx.fillRect(x*sx,y*sy,Math.max(1,sx),Math.max(1,sy));
    }
    for(const e of w.entities){
      if(!e.isHeatMachine)continue;
      ctx.fillStyle=e.temperature>60?'#ef4444':e.temperature>40?'#f59e0b':'#22d3ee';ctx.fillRect(e.x*sx-1,e.y*sy-1,3,3);
    }
    const cam=this.game.camera,rect=this.game.canvas.getBoundingClientRect();
    ctx.strokeStyle='#f8fafc';ctx.lineWidth=1;
    ctx.strokeRect(cam.x*sx,cam.y*sy,(rect.width/cam.zoom)*sx,(rect.height/cam.zoom)*sy);
  }
}
