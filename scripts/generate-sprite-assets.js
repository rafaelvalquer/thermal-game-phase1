import { mkdir,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { INDUSTRIAL_PALETTE as P } from '../src/rendering/IndustrialPalette.js';
import { SPRITES } from '../src/rendering/sprites/SpriteManifest.js';
// Author on a 32px grid. All primitives resolve to integer rectangles; no filters,
// gradients or rotated vector shapes are used in the delivered sheets.
function artwork(type,frame,off,width=32,sheetRow=0){
  const pixels=new Map();
  const rect=(x,y,w,h,c)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(xx>=0&&xx<width&&yy>=0&&yy<32)pixels.set(xx+','+yy,c);};
  const dot=(x,y,c)=>rect(x,y,1,1,c);
  const line=(x0,y0,x1,y1,c)=>{let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;for(;;){dot(x0,y0,c);if(x0===x1&&y0===y1)break;const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}};
  const disc=(cx,cy,r,c)=>{for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)dot(cx+x,cy+y,c);};
  const bolt=(x,y)=>{rect(x,y,2,2,P.shadow);dot(x,y,P.light);};
  const panel=(x,y,w,h)=>{rect(x+2,y+h,w,2,P.ink);rect(x,y,w,h,P.ink);rect(x+1,y+1,w-2,h-2,P.steel);rect(x+1,y+1,w-2,2,P.light);rect(x+w-3,y+3,2,h-4,P.dark);rect(x+2,y+h-3,w-5,1,P.mid);};
  const slats=(x,y,w,count,c=P.mid)=>{for(let i=0;i<count;i++){rect(x,y+i*3,w,2,P.ink);rect(x,y+i*3,w,1,c);}};
  const led=(x,y,n=0)=>rect(x,y,2,1,off?P.shadow:(frame+n)%4===0?P.shine:P.green);
  const rotor=(cx,cy,r)=>{disc(cx,cy,r+1,P.light);disc(cx,cy,r,P.dark);disc(cx,cy,r-1,P.ink);for(let blade=0;blade<4;blade++){const a=(off?0:frame*Math.PI/12)+blade*Math.PI/2;for(let d=2;d<r;d++){const x=Math.round(cx+Math.cos(a)*d),y=Math.round(cy+Math.sin(a)*d);rect(x,y,2,2,P.mid);}}disc(cx,cy,2,P.steel);dot(cx,cy,P.shine);};
  const ports=()=>{rect(0,14,5,5,P.ink);rect(0,15,6,3,P.copper);rect(2,13,2,7,P.mid);rect(width-5,14,5,5,P.ink);rect(width-6,15,6,3,P.copper);rect(width-4,13,2,7,P.mid);};
  if(type==='serverRack'){
    panel(6,2,20,27);rect(8,5,16,21,P.ink);rect(8,4,16,2,P.mid);
    for(let row=0;row<4;row++){const y=8+row*4;rect(9,y,14,3,P.steel);rect(10,y,7,1,P.mid);rect(10,y+2,9,1,P.shadow);led(20,y+1,row);dot(18,y+1,P.yellow);}
    rect(5,27,3,3,P.ink);rect(24,27,3,3,P.ink);bolt(7,3);bolt(23,3);
  }else if(type==='technician'){
    const action=Math.floor(sheetRow/4),direction=sheetRow%4,walk=action===0,work=action===1;
    const stride=walk?[0,1,0,-1][frame]:0,reach=work?[0,1,2,1][frame]:0;
    const skin=P.copperLight,helmet=P.yellow;
    // Feet share a baseline in all views. Each view is authored upright.
    if(direction===0||direction===2){
      rect(10,21,12,8,P.ink);rect(11,22,4,6,P.dark);rect(17,22,4,6,P.steel);
      rect(10-stride,27,6,3,P.ink);rect(17+stride,27,6,3,P.ink);
      rect(11-stride,27,4,1,P.mid);rect(18+stride,27,4,1,P.mid);
      rect(9,12,14,11,P.ink);rect(10,13,12,9,P.steel);rect(11,13,10,2,P.mid);
      rect(10,20,12,3,P.shadow);rect(14,21,3,1,P.yellow);
      rect(7,14+stride,3,7,P.dark);rect(22,14-stride,3,7,P.dark);
      rect(7,20+stride-reach,3,3,P.light);rect(22,20-stride-reach,3,3,P.light);
      if(direction===2){
        rect(12,9,8,5,skin);rect(12,10,1,3,P.copper);dot(14,11,P.ink);dot(18,11,P.ink);rect(15,13,3,1,P.copper);
        rect(15,15,1,5,P.ink);rect(11,16,3,2,P.water);rect(18,16,3,2,P.light);
        rect(20,21,3,4,P.copper);rect(21,20,1,3,P.light);
      }else{
        rect(12,9,8,4,P.dark);rect(13,12,6,2,skin);
        rect(11,16,10,2,P.yellow);rect(12,18,8,1,P.mid);
        rect(9,21,3,4,P.copper);rect(10,20,1,3,P.light);
      }
      rect(10,3,12,7,P.ink);rect(11,4,10,6,helmet);rect(12,4,8,2,P.shine);rect(15,4,2,5,P.copperLight);
      rect(9,9,14,2,direction===2?helmet:P.copper);rect(10,9,12,1,P.yellow);
      if(work){const tx=direction===2?24:6,ty=17-reach;rect(tx,ty,2,7,P.mid);rect(tx-1,ty,4,2,P.light);dot(tx,ty,P.ink);}
    }else if(direction===1){
      rect(12-stride,22,4,7,P.dark);rect(17+stride,22,4,7,P.steel);rect(12-stride,28,6,2,P.ink);rect(17+stride,28,7,2,P.ink);
      rect(11,12,11,11,P.ink);rect(12,13,9,8,P.steel);rect(13,14,5,2,P.mid);rect(12,21,10,2,P.shadow);
      rect(14,10,7,4,skin);rect(20,10,3,2,skin);dot(20,10,P.ink);rect(13,10,2,3,P.dark);
      rect(11,3,11,7,P.ink);rect(12,4,9,6,helmet);rect(13,4,7,2,P.shine);rect(12,9,13,2,helmet);
      rect(14,15,4,6,P.dark);rect(15,16,2,4,P.mid);
      rect(17,work?18-reach:20-stride,work?7:3,3,P.light);
      rect(12,21,4,4,P.copper);rect(13,20,1,3,P.light);
      if(work){rect(24,14-reach,2,9,P.mid);rect(23,14-reach,4,2,P.light);dot(24,14-reach,P.ink);}
    }else{
      rect(11-stride,22,4,7,P.steel);rect(16+stride,22,4,7,P.dark);rect(8-stride,28,7,2,P.ink);rect(14+stride,28,6,2,P.ink);
      rect(10,12,11,11,P.ink);rect(11,13,9,8,P.steel);rect(12,14,6,2,P.mid);rect(10,21,10,2,P.shadow);
      rect(11,10,7,4,skin);rect(8,10,3,2,skin);dot(11,10,P.ink);rect(17,10,2,3,P.dark);
      rect(10,3,11,7,P.ink);rect(11,4,9,6,helmet);rect(12,4,7,2,P.shine);rect(7,9,13,2,helmet);
      rect(14,15,4,6,P.dark);rect(15,16,2,4,P.mid);rect(11,16,2,2,P.water);
      rect(work?7:12,work?18-reach:20+stride,work?8:3,3,P.light);
      rect(18,21,3,3,P.dark);dot(19,21,P.yellow);
      if(work){rect(5,14-reach,2,9,P.mid);rect(4,14-reach,4,2,P.light);dot(5,14-reach,P.ink);}
    }
  }else if(type==='machine'){
    panel(4,6,24,22);rect(7,9,12,8,P.ink);rect(8,10,10,5,off?P.dark:P.water);if(!off){line(9,13,11,12,P.cyan);line(11,12,13,14,P.cyan);line(13,14,16,11,P.cyan);}led(22,10);rect(22,14,2,2,P.yellow);slats(8,20,16,2);bolt(5,7);bolt(25,25);
  }else if(type==='furnace'){
    panel(4,8,24,21);rect(8,2,6,7,P.ink);rect(9,2,4,6,P.mid);rect(7,12,18,12,P.ink);rect(8,13,16,10,off?P.shadow:'#673e30');
    if(!off)for(let x=9;x<24;x+=2){const h=3+(x*5+frame*3)%7;rect(x,23-h,2,h,P.copper);rect(x,24-Math.max(2,h-3),1,Math.max(2,h-3),P.yellow);}
    rect(8,25,16,2,P.dark);for(let x=8;x<24;x+=4)rect(x,25,2,2,P.yellow);bolt(5,9);bolt(25,9);
  }else if(type==='fan'||type==='exhaust'){
    panel(3,3,26,26);rotor(16,16,10);for(const [x,y] of [[4,4],[25,4],[4,25],[25,25]])bolt(x,y);
    if(type==='exhaust'){rect(7,6,18,1,P.yellow);rect(7,26,18,1,P.yellow);for(let x=8;x<26;x+=4)rect(x,7,1,18,P.steel);}
  }else if(type==='pump'){
    ports();rect(6,23,21,5,P.ink);rect(7,23,19,2,P.mid);panel(7,8,12,15);rotor(13,16,5);rect(20,10,7,13,P.steel);slats(21,11,5,4);rect(20,9,6,2,P.copper);led(21,24);
  }else if(type==='tank'){
    ports();panel(6,4,20,23);rect(8,2,16,3,P.mid);rect(11,0,8,3,P.dark);rect(8,7,16,17,P.water);rect(9,8,2,15,P.cyan);const wave=off?11:10+frame%2;rect(8,7,16,wave-7,P.shadow);rect(8,wave,16,1,P.light);rect(22,9,1,13,P.light);for(let y=10;y<22;y+=3)rect(20,y,3,1,P.mid);rect(8,27,3,3,P.ink);rect(21,27,3,3,P.ink);
  }else if(type==='radiator'){
    ports();panel(5,4,22,24);for(let x=7;x<26;x+=3){rect(x,7,2,17,P.ink);rect(x,7,1,17,P.mid);}rotor(16,16,7);rect(7,5,17,1,P.copper);rect(7,25,17,1,P.copperLight);
  }else if(type==='exchanger'){
    ports();panel(5,6,22,21);for(let y=9;y<24;y+=3){rect(8,y,16,2,P.ink);rect(8,y,16,1,P.mid);}rect(7,8,2,16,P.copper);rect(23,8,2,16,P.water);for(let y=10;y<24;y+=6){rect(9,y,14,1,P.copperLight);if(!off)dot(10+(frame*3)%12,y,P.cyan);}bolt(6,7);bolt(24,25);
  }else if(type==='sensor'){
    rect(14,22,4,7,P.mid);rect(10,28,12,2,P.ink);panel(7,5,18,18);rect(10,9,12,9,P.ink);rect(11,10,10,6,off?P.dark:P.water);if(!off){rect(13,12,2,3,P.cyan);rect(17,11,2,4,P.cyan);}led(12,20);bolt(8,6);
  }else if(type==='battery'){
    panel(5,3,22,26);rect(11,1,10,3,P.mid);rect(8,7,16,7,P.ink);rect(9,8,14,5,off?P.dark:P.water);rect(10,9,3,3,off?P.mid:P.cyan);rect(14,9,3,3,off?P.mid:P.cyan);rect(18,9,3,3,off?P.mid:P.cyan);
    rect(9,16,14,8,P.ink);rect(10,17,12,6,P.shadow);rect(11,18,10,4,P.steel);rect(15,18,2,3,P.yellow);rect(14,20,4,1,P.copperLight);
    for(let i=0;i<4;i++){rect(8,25+i%2,3,2,P.mid);rect(21,25+i%2,3,2,P.mid);}led(24,5,frame);bolt(6,4);bolt(25,26);
  }else if(type==='solarPanel'){
    // Four photovoltaic columns carry a short reflection only while generating.
    panel(2,6,28,18);rect(3,8,26,14,P.ink);
    for(let row=0;row<2;row++)for(let col=0;col<4;col++){
      const cx=5+col*6,cy=9+row*6,lit=!off&&col===frame;
      rect(cx,cy,5,5,P.dark);rect(cx+1,cy+1,3,3,off?P.shadow:lit?P.cyan:P.water);
      rect(cx+1,cy+1,3,1,off?P.steel:lit?P.shine:P.cyan);
      dot(cx+1,cy+3,off?P.dark:lit?P.shine:P.mid);
    }
    rect(3,7,26,1,P.light);rect(4,22,24,1,P.mid);
    rect(8,24,2,5,P.steel);rect(22,24,2,5,P.steel);rect(7,29,18,1,P.ink);rect(9,28,14,1,P.mid);
    rect(15,24,2,4,off?P.mid:P.copperLight);rect(16,27,5,1,off?P.mid:P.copper);
    rect(26,23,2,1,off?P.shadow:P.green);bolt(3,6);bolt(27,6);
  }else if(type.startsWith('cooling')){
    const compact=type==='coolingCompact',industrial=type==='coolingIndustrial';
    panel(2,5,width-4,23);ports();
    if(compact){slats(5,9,6,5);rotor(21,16,7);rect(5,25,22,1,P.cyan);}
    else if(industrial){slats(5,9,10,5);rotor(27,16,9);rotor(48,16,9);rect(18,6,1,20,P.mid);rect(38,6,1,20,P.mid);rect(5,25,width-10,1,P.copperLight);for(let x=6;x<width-4;x+=12)bolt(x,6);}
    else{slats(5,9,7,5,P.cyan);rotor(22,16,7);rect(14,8,1,17,P.mid);rect(5,25,22,1,P.copperLight);}
    led(width-7,7);rect(4,28,4,2,P.ink);rect(width-8,28,4,2,P.ink);
  }else if(type==='supplyVent'){
    panel(3,5,26,22);for(let y=9;y<25;y+=3){rect(6,y,20,2,P.ink);rect(6,y,20,1,off?P.mid:P.cyan);}rect(15,27,2,3,P.cyan);rect(13,28,6,1,P.cyan);bolt(4,6);bolt(26,6);
  }else{
    panel(6,5,20,24);rect(10,9,12,13,P.ink);for(let i=0;i<3;i++)rect(12+i*3,12+i*2,2,8-i*2,P.copper);rect(9,25,14,1,P.yellow);bolt(7,6);
  }
  // Coalesce horizontal runs while preserving the exact authored pixel grid.
  let svg='';for(let y=0;y<32;y++){let x=0;while(x<width){const c=pixels.get(x+','+y);if(!c){x++;continue;}const start=x;while(x<width&&pixels.get(x+','+y)===c)x++;svg+=`<rect x="${start}" y="${y}" width="${x-start}" height="1" fill="${c}"/>`;}}
  return svg;
}
for(const [id,s] of Object.entries(SPRITES)){
  let content='';for(let row=0;row<s.rows;row++)for(let frame=0;frame<s.frames;frame++)content+=`<g transform="translate(${frame*s.frameWidth} ${row*64}) scale(2)">${artwork(id,frame,id==='technician'?false:row===1,s.frameWidth/2,row)}</g>`;
  const width=s.frameWidth*s.frames,height=s.frameHeight*s.rows,path=resolve('public',s.path.slice(1));await mkdir(dirname(path),{recursive:true});
  await writeFile(path,`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${content}</svg>\n`);
}
console.log(`Generated ${Object.keys(SPRITES).length} pixel-art sheets with running and idle states.`);

// Shared title-screen illustration, authored with the same equipment pixels.
let room='<rect width="320" height="160" fill="#1c282e"/>';
for(let y=16;y<144;y+=16)for(let x=16;x<304;x+=16)room+=`<rect x="${x}" y="${y}" width="15" height="15" fill="${(x+y)%32?'#34474c':'#3c5055'}"/>`;
room+='<path d="M16 136V16H304V136" fill="none" stroke="#819594" stroke-width="8"/><path d="M24 25H296" stroke="#a7b9b3" stroke-width="2"/><path d="M30 120H286" stroke="#e3b657" stroke-width="2"/>';
for(let row=0;row<2;row++)for(let col=0;col<6;col++)room+=`<g transform="translate(${40+col*34} ${35+row*42})">${artwork('serverRack',col%4,false)}</g>`;
room+=`<g transform="translate(257 47)">${artwork('coolingUnit',0,false)}</g><g transform="translate(257 91)">${artwork('pump',0,false)}</g>`;
await mkdir(resolve('public/assets/scenes'),{recursive:true});
await writeFile(resolve('public/assets/scenes/factory.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 320 160" shape-rendering="crispEdges">${room}</svg>\n`);
