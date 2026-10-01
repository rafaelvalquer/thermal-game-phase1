import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { NavigationGrid } from '../visual/NavigationGrid.js';
import { coordinateMapper } from '../../../bridge/CoordinateMapper.js';

export class FirstPersonController {
  constructor(camera,canvas){this.camera=camera;this.controls=new PointerLockControls(camera,canvas);this.keys=new Set();this.speed=3.2;this.radius=.22;this.grid=null;this.onUnlock=null;
    this.keydown=e=>{if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code))this.keys.add(e.code);};
    this.keyup=e=>this.keys.delete(e.code);window.addEventListener('keydown',this.keydown);window.addEventListener('keyup',this.keyup);this.controls.addEventListener('unlock',()=>this.onUnlock?.());}
  enter(world,snapshot){
    this.grid=new NavigationGrid(world);const spawn=snapshot?.player||{x:world.width/2,y:1.65,z:world.height/2};
    const requested=coordinateMapper.tileCenter(spawn.x,spawn.z??spawn.y,1.65),safe=this.findSafeSpawn(world,requested.x,requested.z);
    const position=safe||requested;this.camera.position.set(position.x,1.65,position.z);this.camera.rotation.set(0,0,0);this.camera.updateProjectionMatrix?.();
  }
  findSafeSpawn(world,x,z){
    if(this.grid.canOccupy(x,z,this.radius))return{x,z};
    let best=null,bestDistance=Infinity;
    for(let y=0;y<world.height;y++)for(let tx=0;tx<world.width;tx++){
      const tile=coordinateMapper.tileCenter(tx,y,1.65);if(!this.grid.canOccupy(tile.x,tile.z,this.radius))continue;
      const distance=(tile.x-x)**2+(tile.z-z)**2;if(distance<bestDistance){best={x:tile.x,z:tile.z};bestDistance=distance;}
    }
    return best;
  }
  update(dt){
    if(!this.controls.isLocked||!this.grid)return;
    const step=this.speed*Math.min(.05,dt),forward=(this.keys.has('KeyW')?1:0)-(this.keys.has('KeyS')?1:0),side=(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0);
    if(!forward&&!side)return;
    const direction=this.camera.getWorldDirection(new THREEVector());direction.y=0;direction.normalize();
    const right=new THREEVector().crossVectors(direction,new THREEVector(0,1,0)).normalize();
    const nx=this.camera.position.x+direction.x*forward*step+right.x*side*step,nz=this.camera.position.z+direction.z*forward*step+right.z*side*step;
    if(this.grid.canOccupy(nx,this.camera.position.z,this.radius))this.camera.position.x=nx;
    if(this.grid.canOccupy(this.camera.position.x,nz,this.radius))this.camera.position.z=nz;
  }
  updateWorld(world){this.grid=new NavigationGrid(world);}
  dispose(){window.removeEventListener('keydown',this.keydown);window.removeEventListener('keyup',this.keyup);this.controls.dispose();}
}
import { Vector3 as THREEVector } from 'three';
