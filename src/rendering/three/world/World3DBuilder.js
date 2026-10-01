import { BoxGeometry, Color, DoubleSide, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry } from 'three';
import { coordinateMapper } from '../../../bridge/CoordinateMapper.js';
import { ThermalColorScale } from '../visual/ThermalColorScale.js';

const WALL_COLORS={concrete:'#657786',wood:'#826b50',insulation:'#c6b681',steel:'#718096',copper:'#b86132'};
const WALL_TYPES=new Set(Object.keys(WALL_COLORS));

export class World3DBuilder {
  constructor(scene){this.scene=scene;this.floor=null;this.walls=[];this.ceiling=null;this.builtKey=null;this.dummy=new Object3D();this.floorColor=new Color();this.floorMaterial=new MeshStandardMaterial({color:'#172330',roughness:.88,metalness:.16});this.lastThermalKey=null;}
  build(snapshot){
    const {width,height,materialIds,ownedTiles}=snapshot.world;
    const key=[width,height,snapshot.world.materialTopologyVersion,snapshot.world.landTopologyVersion,ownedTiles?Array.from(ownedTiles).reduce((n,v)=>n+v,0):'all'].join(':');
    if(key===this.builtKey)return false;
    this.clear();this.builtKey=key;
    const floorGeo=new BoxGeometry(.98,.12,.98),count=width*height,mesh=new InstancedMesh(floorGeo,this.floorMaterial,count);mesh.name='world-floor';mesh.instanceMatrix.setUsage(35048);
    const ownedColor='#293846',lockedColor='#101923',dummy=this.dummy;let index=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=coordinateMapper.tileCenter(x,y,-.09);dummy.position.set(p.x,p.y,p.z);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
      mesh.setColorAt(index,this.floorColor.set((ownedTiles&&!ownedTiles[y*width+x])?lockedColor:ownedColor));index++;
    }
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;this.floor=mesh;this.scene.add(mesh);
    const wallsByType=new Map();
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const material=materialIds?.[y*width+x];if(!WALL_TYPES.has(material))continue;
      const entries=wallsByType.get(material)||[];entries.push({x,y});wallsByType.set(material,entries);
    }
    for(const [type,cells] of wallsByType){
      const wall=new InstancedMesh(new BoxGeometry(.98,3.2,.98),new MeshStandardMaterial({color:WALL_COLORS[type],roughness:.72,metalness:.16}),cells.length);wall.name='walls-'+type;wall.instanceMatrix.setUsage(35048);
      cells.forEach((cell,i)=>{const p=coordinateMapper.tileCenter(cell.x,cell.y,1.5);dummy.position.set(p.x,p.y,p.z);dummy.updateMatrix();wall.setMatrixAt(i,dummy.matrix);});wall.instanceMatrix.needsUpdate=true;this.walls.push(wall);this.scene.add(wall);
    }
    this.ceiling=new Mesh(new PlaneGeometry(width,height),new MeshStandardMaterial({color:'#8da0aa',roughness:.85,metalness:.08,side:DoubleSide,transparent:true,opacity:.16}));
    this.ceiling.rotation.x=-Math.PI/2;this.ceiling.position.set(width/2,3.4,height/2);this.ceiling.name='world-ceiling';this.ceiling.visible=false;this.scene.add(this.ceiling);
    return true;
  }
  setCeilingVisible(visible){if(this.ceiling)this.ceiling.visible=Boolean(visible);}
  updateOverlay(snapshot,mode='normal'){
    if(!this.floor||!snapshot.world.temperatures)return;
    const thermalKey=[mode,snapshot.version,snapshot.createdAt].join(':');if(thermalKey===this.lastThermalKey)return;
    this.lastThermalKey=thermalKey;
    const width=snapshot.world.width,color=this.floorColor.set('#293846'),cold=new Color('#168aad'),hot=new Color('#ef4444'),cyan=new Color('#22d3ee'),blue=new Color('#3b82f6'),green=new Color('#34d399'),yellow=new Color('#facc15'),orange=new Color('#f97316'),purple=new Color('#a78bfa');
    const tileRecords=new Map();
    for(const record of snapshot.equipment){
      const index=record.y*width+record.x,records=tileRecords.get(index)||[];records.push(record);tileRecords.set(index,records);
    }
    for(let i=0;i<snapshot.world.temperatures.length;i++){
      const records=tileRecords.get(i)||[];
      color.set(snapshot.world.ownedTiles&&!snapshot.world.ownedTiles[i]?'#101923':'#293846');
      if(mode==='thermal')ThermalColorScale.colorAt(snapshot.world.temperatures[i],color);
      else if(mode==='airflow'){
        const vx=snapshot.simulation.airX?.[i]||0,vy=snapshot.simulation.airY?.[i]||0,magnitude=Math.min(1,Math.hypot(vx,vy)*5);
        if(magnitude>0)color.copy(cold).lerp(cyan,magnitude);
      }else if(mode==='power'){
        const load=records.reduce((sum,record)=>sum+Math.max(0,record.powerKW),0),capacity=records.reduce((sum,record)=>sum+Math.max(0,record.ratedPowerKW),0);
        if(load>0)color.copy(blue).lerp(yellow,Math.min(1,capacity?load/capacity:1));
      }else if(mode==='cooling'){
        const cooling=records.some(record=>['coolingUnit','supplyVent','duct','fan'].includes(record.type));
        if(cooling)color.copy(blue);
      }else if(mode==='water'){
        const water=records.some(record=>['pipe','pump','tank','radiator','exchanger','waterChiller'].includes(record.type));
        if(water)color.copy(cyan);
      }else if(mode==='alarms'){
        const alarm=records.some(record=>record.status==='alarm'||record.status==='blocked'||record.status==='disconnected');
        if(alarm)color.copy(hot);
      }else if(mode==='contracts'){
        const contracted=records.some(record=>record.contractIds.length>0);
        if(contracted)color.copy(green);
        else if(records.some(record=>record.occupancy>0))color.copy(purple);
      }
      if(records.some(record=>snapshot.metrics.alertEquipmentIds?.includes(String(record.id))))color.copy(hot).lerp(orange,.28);
      this.floor.setColorAt(i,color);
    }
    if(this.floor.instanceColor)this.floor.instanceColor.needsUpdate=true;
  }
  clear(){
    if(this.floor){this.scene.remove(this.floor);this.floor.geometry.dispose();this.floor=null;}
    for(const wall of this.walls){this.scene.remove(wall);wall.geometry.dispose();wall.material.dispose();}this.walls=[];
    if(this.ceiling){this.scene.remove(this.ceiling);this.ceiling.geometry.dispose();this.ceiling.material.dispose();this.ceiling=null;}
    this.builtKey=null;
  }
  dispose(){this.clear();this.floorMaterial.dispose();}
}
