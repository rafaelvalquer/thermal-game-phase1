import { BufferGeometry, Float32BufferAttribute, Points, PointsMaterial } from 'three';
import { coordinateMapper } from '../../../bridge/CoordinateMapper.js';

export class AirflowParticleOverlay3D {
  constructor(scene,count=1500){
    this.count=Math.max(0,Math.floor(count));this.positions=new Float32Array(this.count*3);this.geometry=new BufferGeometry();this.geometry.setAttribute('position',new Float32BufferAttribute(this.positions,3));
    this.material=new PointsMaterial({color:'#a5f3fc',size:.075,transparent:true,opacity:.72,depthWrite:false,sizeAttenuation:true});this.points=new Points(this.geometry,this.material);this.points.name='airflow-particles';this.points.frustumCulled=false;scene.add(this.points);this.seed=0x63ac4b21;this.initialized=false;
  }
  random(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed/4294967296;}
  respawn(index,snapshot){
    const world=snapshot.world;let tile=0;
    for(let attempt=0;attempt<12;attempt++){
      tile=Math.floor(this.random()*(world.width*world.height));
      if((!world.ownedTiles||world.ownedTiles[tile])&&world.materialIds[tile]==='air')break;
    }
    const x=tile%world.width,y=Math.floor(tile/world.width),p=coordinateMapper.tileCenter(x,y,.16);
    this.positions[index*3]=p.x+(this.random()-.5)*.84;this.positions[index*3+1]=p.y+this.random()*2.25;this.positions[index*3+2]=p.z+(this.random()-.5)*.84;
  }
  initialize(snapshot){for(let i=0;i<this.count;i++)this.respawn(i,snapshot);this.initialized=true;this.geometry.attributes.position.needsUpdate=true;}
  update(snapshot,dt,enabled){
    this.points.visible=Boolean(enabled&&this.count);if(!enabled||!this.count||!snapshot)return;
    if(!this.initialized)this.initialize(snapshot);
    const {width,height,airX,airY}=snapshot.world;
    for(let i=0;i<this.count;i++){
      const offset=i*3,x=this.positions[offset],z=this.positions[offset+2],cell=coordinateMapper.worldToTile(x,z);
      if(!airX||!airY||cell.x<0||cell.y<0||cell.x>=width||cell.y>=height){this.respawn(i,snapshot);continue;}
      const index=cell.y*width+cell.x,vx=airX[index]||0,vz=airY[index]||0,speed=Math.min(3.5,Math.hypot(vx,vz));
      this.positions[offset]=x+vx*dt*3;this.positions[offset+2]=z+vz*dt*3;this.positions[offset+1]+=(this.random()-.5)*dt*.03;
      const next=coordinateMapper.worldToTile(this.positions[offset],this.positions[offset+2]);
      if(speed<.005||next.x<0||next.y<0||next.x>=width||next.y>=height)this.respawn(i,snapshot);
    }
    this.geometry.attributes.position.needsUpdate=true;
  }
  dispose(scene){scene.remove(this.points);this.geometry.dispose();this.material.dispose();}
}
