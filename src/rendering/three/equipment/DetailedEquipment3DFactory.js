import { BoxGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Object3D, TorusGeometry } from 'three';
import { coordinateMapper } from '../../../bridge/CoordinateMapper.js';
import { rackParts } from './Rack3DBuilder.js';
import { condenserParts } from './Condenser3DBuilder.js';

const MATERIALS={
  rackBody:['#202a35',.68,.52],rackSide:['#354554',.5,.48],rackRail:['#778896',.38,.68],
  cpuModule:['#354653',.55,.35],gpuModule:['#394052',.47,.5],storageModule:['#284551',.55,.38],managedModule:['#414a50',.58,.4],
  rackVent:['#0c1620',.9,.12],rackFan:['#111923',.42,.55],driveBay:['#7293a3',.37,.45],
  cpuBadge:['#3bbbaa',.36,.45],gpuBadge:['#a88cfa',.36,.45],storageBadge:['#62b8e4',.36,.45],managedBadge:['#e4ae68',.36,.45],
  condenserBody:['#697d88',.55,.38],condenserSide:['#8a9ca2',.4,.5],condenserPanel:['#374b56',.72,.4],
  condenserGrille:['#162b34',.61,.4],condenserTop:['#566c77',.51,.42],fanRing:['#1e313b',.45,.57],fanHub:['#a3b3b6',.31,.63],fanBlade:['#303f48',.4,.64],
};

const poseKey=record=>[record.x,record.y,record.direction?.x,record.direction?.y,record.footprintLength].join('|');
const lightKey=record=>[record.enabled,record.powerBlocked,record.status,Math.round((record.occupancy||0)*100)].join('|');

export class DetailedEquipment3DFactory {
  constructor(scene){
    this.scene=scene;this.meshes=new Map();this.recordIdsByMesh=new Map();this.buckets=new Map();this.signature='';
    this.geometries={box:new BoxGeometry(1,1,1),cylinder:new CylinderGeometry(.5,.5,1,12),torus:new TorusGeometry(.5,.055,8,20)};
    this.materials=Object.fromEntries(Object.entries(MATERIALS).map(([name,[color,roughness,metalness]])=>[name,new MeshStandardMaterial({color,roughness,metalness})]));
    this.materials.led=new MeshBasicMaterial({color:'#ffffff',toneMapped:false});
    this.root=new Object3D();this.local=new Object3D();this.color=new Color();this.matrix=new Matrix4();
  }
  sync(buckets){
    const signature=[...buckets].map(([kind,records])=>kind+':'+records.map(record=>record.id).join(',')).join('|');
    const rebuilt=signature!==this.signature;
    if(rebuilt){this.clear();this.signature=signature;for(const [kind,records] of buckets)this.createBucket(kind,records);}
    let changed=rebuilt;
    for(const [kind,records] of buckets){
      const bucket=this.buckets.get(kind);bucket.records=records;
      records.forEach((record,index)=>{
        const pose=poseKey(record),light=lightKey(record);
        if(rebuilt||pose!==bucket.poses[index]){this.updatePose(bucket,index,record);bucket.poses[index]=pose;changed=true;}
        if(rebuilt||light!==bucket.lights[index]){this.updateLights(bucket,index,record,true);bucket.lights[index]=light;changed=true;}
      });
    }
    return changed;
  }
  createBucket(kind,records){
    const definitions=kind.startsWith('coolingUnit')?condenserParts(kind):rackParts(kind);
    const bucket={kind,records,parts:[],poses:Array(records.length).fill(null),lights:Array(records.length).fill(null)};
    for(const definition of definitions){
      const mesh=new InstancedMesh(this.geometries[definition.shape],this.materials[definition.material],records.length*definition.pieces.length);
      const key=definition.key==='body'?kind:`${kind}:${definition.key}`;
      mesh.name=`equipment-${key}`;mesh.userData.equipment=true;mesh.userData.detailed=true;mesh.frustumCulled=false;
      this.scene.add(mesh);this.meshes.set(key,mesh);
      this.recordIdsByMesh.set(mesh,records.flatMap(record=>definition.pieces.map(()=>record.id)));
      bucket.parts.push({definition,mesh});
    }
    this.buckets.set(kind,bucket);
  }
  rootMatrix(record){
    const length=Math.max(1,record.footprintLength||1),direction=record.direction||{x:0,y:-1};
    const center=coordinateMapper.tileCenter(record.x,record.y,0);
    this.root.position.set(center.x+(direction.x||0)*(length-1)/2,0,center.z+(direction.y||0)*(length-1)/2);
    this.root.rotation.set(0,coordinateMapper.directionToYaw(direction),0);this.root.scale.set(1,1,1);this.root.updateMatrix();return this.root.matrix;
  }
  partMatrix(root,piece,phase=0){
    let x=piece.x,z=piece.z,ry=piece.ry||0;
    if(piece.bladeIndex!=null){
      const angle=phase+piece.bladeIndex*Math.PI/2;
      x=Math.sin(angle)*.15;z=piece.fanCenterZ+Math.cos(angle)*.15;ry=angle;
    }
    this.local.position.set(x,piece.y,z);this.local.rotation.set(piece.rx||0,ry,piece.rz||0);
    this.local.scale.set(piece.sx,piece.sy,piece.sz);this.local.updateMatrix();
    return this.matrix.multiplyMatrices(root,this.local.matrix);
  }
  updatePose(bucket,index,record){
    const root=this.rootMatrix(record).clone();
    for(const {definition,mesh} of bucket.parts){
      definition.pieces.forEach((piece,partIndex)=>mesh.setMatrixAt(index*definition.pieces.length+partIndex,this.partMatrix(root,piece)));
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
  lightColor(record,active=true){
    if(!record.enabled||record.powerBlocked||record.status==='off'||record.status==='blocked')return '#17232c';
    if(record.status==='alarm')return active?'#ff4055':'#451822';
    if(record.status==='disconnected'||record.status==='warning'||record.occupancy>.9)return '#fbbf24';
    return record.type==='coolingUnit'?'#67e8f9':'#4ade80';
  }
  updateLights(bucket,index,record,active){
    const color=this.color.set(this.lightColor(record,active));
    for(const {definition,mesh} of bucket.parts){if(!definition.led)continue;
      definition.pieces.forEach((_,partIndex)=>mesh.setColorAt(index*definition.pieces.length+partIndex,color));
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
  }
  animate(phases,blinkOn=true){
    for(const bucket of this.buckets.values()){
      const rotor=bucket.parts.find(part=>part.definition.rotor);
      if(rotor){let dirty=false;
        bucket.records.forEach((record,index)=>{
          const phase=phases.get(record.id);if(phase==null)return;
          const root=this.rootMatrix(record).clone();
          rotor.definition.pieces.forEach((piece,partIndex)=>rotor.mesh.setMatrixAt(index*rotor.definition.pieces.length+partIndex,this.partMatrix(root,piece,phase)));
          dirty=true;
        });
        if(dirty)rotor.mesh.instanceMatrix.needsUpdate=true;
      }
      if(!blinkOn)bucket.records.forEach((record,index)=>{if(record.status==='alarm')this.updateLights(bucket,index,record,false);});
      else bucket.records.forEach((record,index)=>{if(record.status==='alarm')this.updateLights(bucket,index,record,true);});
    }
  }
  recordAt(intersection){return this.recordIdsByMesh.get(intersection?.object)?.[intersection.instanceId]||null;}
  clear(){for(const mesh of this.meshes.values())this.scene.remove(mesh);this.meshes.clear();this.recordIdsByMesh.clear();this.buckets.clear();this.signature='';}
  dispose(){this.clear();for(const geometry of Object.values(this.geometries))geometry.dispose();for(const material of Object.values(this.materials))material.dispose();}
}
