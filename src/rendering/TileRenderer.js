import { INDUSTRIAL_PALETTE as P } from './IndustrialPalette.js';
export class TileRenderer {
  constructor(){this.cache=new Map();}
  draw(ctx,world,tile,zones=[],mode='normal',bounds=null){
    const minX=Math.max(0,Math.floor((bounds?.x??0)/tile)-1),minY=Math.max(0,Math.floor((bounds?.y??0)/tile)-1);
    const maxX=Math.min(world.width,Math.ceil(((bounds?.x??0)+(bounds?.width??world.width*tile))/tile)+1),maxY=Math.min(world.height,Math.ceil(((bounds?.y??0)+(bounds?.height??world.height*tile))/tile)+1);
    for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){
      const m=world.materialAt(x,y),style=this.zoneStyle(zones,x,y),variant=((x*17+y*31)>>>0)%4;
      let mask=0;for(const [i,[dx,dy]] of [[0,[0,-1]],[1,[1,0]],[2,[0,1]],[3,[-1,0]]])if(world.inBounds(x+dx,y+dy)&&world.materialAt(x+dx,y+dy).id===m.id)mask|=1<<i;
      this.tile(ctx,m.id,style,variant,mask,x*tile,y*tile,tile,mode,m.color);
    }
    if(mode!=='normal')this.grid(ctx,world,tile,.025,{minX,minY,maxX,maxY});
  }
  zoneStyle(zones,x,y){return zones.find(z=>x>=z.x&&y>=z.y&&x<z.x+z.width&&y<z.y+z.height)?.visualStyle||'default';}
  tile(ctx,id,style,variant,mask,x,y,size,mode='normal',fallback=P.floor){
    const detailed=mode==='normal',key=[id,style,variant,mask,detailed,fallback].join(':');
    let canvas=this.cache.get(key);
    if(!canvas&&typeof document!=='undefined'){
      canvas=document.createElement('canvas');canvas.width=canvas.height=32;
      this.paint(canvas.getContext('2d'),id,style,variant,mask,detailed,fallback);
      this.cache.set(key,canvas);
    }
    if(canvas){ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,x,y,size,size);}
    else{ctx.save();ctx.translate(x,y);ctx.scale(size/32,size/32);this.paint(ctx,id,style,variant,mask,detailed,fallback);ctx.restore();}
  }
  floor(ctx,x,y,px,py,tile,style='default'){this.tile(ctx,'air',style,(x*17+y*31)%4,15,px,py,tile);}
  material(ctx,m,x,y,px,py,tile){this.tile(ctx,m.id,'default',(x*17+y*31)%4,0,px,py,tile,'normal',m.color);}
  paint(ctx,id,style,v,mask,detailed,fallback){
    const r=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,w,h);};
    if(id==='air'){
      const colors={default:['#344247','#38464b'],server:['#33464b','#394e53'],lab:['#506260','#556965'],office:['#46545a','#4c5b61'],industrial:['#494a42','#504f45'],corridor:['#3d494c','#414e51'],utility:['#494b3f','#505242']};
      const colorset=colors[style]||colors.default;r(0,0,32,32,colorset[v%2]);
      r(0,0,32,1,'#202d32');r(0,0,1,32,'#202d32');r(1,1,30,1,'#ffffff0a');
      if(!detailed)return;
      for(let i=0;i<7;i++)r((i*11+v*7)%29+1,(i*7+v*11)%28+2,1+(i%2),1,i%2?'#ffffff06':'#00000010');
      if(style==='server'){for(const [x,y] of [[3,3],[28,3],[3,28],[28,28]])r(x,y,1,1,P.mid);if(v===2)for(let i=0;i<5;i++)r(8,8+i*3,16,1,P.dark);}
      if(style==='lab'){r(2,29,28,1,'#72827a');}
      if(style==='corridor'){r(2,0,2,32,P.yellow);r(28,0,2,32,P.yellow);}
      if(style==='utility'&&v===1)for(let i=0;i<8;i++)r(4+i*3,26,2,3,i%2?P.yellow:P.ink);
      return;
    }
    if(id==='concrete'){
      r(0,0,32,32,'#59686a');r(2,2,28,24,'#718080');
      if(!(mask&1)){r(0,0,32,3,'#a5b1a6');r(1,3,30,1,'#88968c');}
      if(!(mask&2))r(29,0,3,32,'#344147');
      if(!(mask&4)){r(0,26,32,3,'#45565b');r(0,29,32,3,P.shadow);}
      if(!(mask&8))r(0,0,2,32,'#8d9b92');
      if(detailed){r(8+v*4,10,5,1,'#637273');r(5+v*2,19,2,1,'#8a9791');}
    }else if(id==='insulation'){
      r(0,0,32,32,'#554d38');r(2,2,28,27,'#a49867');r(3,3,26,2,'#c7bc86');
      if(detailed)for(let n=0;n<5;n++){r(4+n*5,7,2,18,'#8b8057');r(6+n*5,7,1,18,'#b1a775');}
      r(0,28,32,4,P.dark);for(let n=0;n<8;n++)r(n*4,28,2,3,P.yellow);
    }else if(id==='copper'){
      r(0,0,32,32,'#643f2c');r(2,2,28,28,P.copper);r(3,3,26,2,P.copperLight);r(27,5,3,23,'#965b37');
      if(detailed){for(let n=0;n<4;n++)r(5,9+n*4,20,1,'#a76a40');for(const x of [4,25])for(const y of [4,25])r(x,y,2,2,P.shine);}
    }else{r(0,0,32,32,fallback);if(detailed)for(let n=0;n<5;n++)r(3+n*5,6+v*3,2,9,'#00000018');}
  }
  grid(ctx,world,tile,alpha=.055,b={minX:0,minY:0,maxX:world.width,maxY:world.height}){
    ctx.strokeStyle=`rgba(180,200,200,${alpha})`;ctx.lineWidth=.5;ctx.beginPath();
    for(let x=b.minX;x<=b.maxX;x++){ctx.moveTo(x*tile,b.minY*tile);ctx.lineTo(x*tile,b.maxY*tile);}
    for(let y=b.minY;y<=b.maxY;y++){ctx.moveTo(b.minX*tile,y*tile);ctx.lineTo(b.maxX*tile,y*tile);}ctx.stroke();
  }
}
