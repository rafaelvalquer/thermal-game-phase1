import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { coordinateMapper } from '../../../bridge/CoordinateMapper.js';

const SIDES=[
  {name:'east',dx:1,dy:0,rotation:0},
  {name:'west',dx:-1,dy:0,rotation:0},
  {name:'south',dx:0,dy:1,rotation:Math.PI/2},
  {name:'north',dx:0,dy:-1,rotation:Math.PI/2},
];
const connectionFor=(record,side)=>record.ductConnections?.find(connection=>connection.direction===side.name)||null;

/** Renders each logical duct tile as a shared center, connected arms and terminal fittings. */
export class AirDuct3DFactory {
  constructor(scene){
    this.scene=scene;this.meshes=new Map();this.recordIdsByMesh=new Map();this.records=[];this.signature='';this.states=[];
    this.geometry={body:new BoxGeometry(.46,.24,.46),arm:new BoxGeometry(.62,.24,.38),cap:new BoxGeometry(.09,.3,.46),coupler:new BoxGeometry(.14,.31,.5)};
    this.material=new MeshStandardMaterial({color:'#ffffff',roughness:.48,metalness:.62});
    this.dummy=new Object3D();this.color=new Color();
  }
  sync(records){
    const signature=records.map(record=>record.id).join('|'),rebuilt=signature!==this.signature;
    if(!rebuilt&&!records.some((record,index)=>this.stateOf(record)!==this.states[index]))return false;
    this.signature=signature;this.records=records;
    if(rebuilt){this.clearMeshes();this.states=Array(records.length).fill(null);
      if(!records.length)return true;
      this.createMesh('body',this.geometry.body,records.length,records.map(record=>record.id));
      const repeated=records.flatMap(record=>SIDES.map(()=>record.id));
      this.createMesh('arms',this.geometry.arm,records.length*SIDES.length,repeated);
      this.createMesh('caps',this.geometry.cap,records.length*SIDES.length,repeated);
      this.createMesh('couplers',this.geometry.coupler,records.length*SIDES.length,repeated);
    }
    let changed=rebuilt;
    records.forEach((record,index)=>{
      const state=this.stateOf(record);if(!rebuilt&&state===this.states[index])return;
      this.states[index]=state;changed=true;
      const center=coordinateMapper.tileCenter(record.x,record.y,2.9);
      this.setPart(this.meshes.get('body'),index,center,0,1,1,1);
      const color=this.color.set(record.networkStatus==='READY'?(record.flowRate>0?'#7da0a6':'#6a7e84'):'#505d64');
      for(let sideIndex=0;sideIndex<SIDES.length;sideIndex++){
        const side=SIDES[sideIndex],connection=connectionFor(record,side),instance=index*SIDES.length+sideIndex;
        const position={x:center.x+side.dx*.23,y:center.y,z:center.z+side.dy*.23};
        this.setPart(this.meshes.get('arms'),instance,position,side.rotation,connection?1:0,1,1);
        const capPosition={x:center.x+side.dx*.48,y:center.y,z:center.z+side.dy*.48};
        this.setPart(this.meshes.get('caps'),instance,capPosition,side.rotation,connection?0:1,1,1);
        const terminal=connection&&connection.type!=='duct';
        const fittingPosition={x:center.x+side.dx*.43,y:center.y,z:center.z+side.dy*.43};
        this.setPart(this.meshes.get('couplers'),instance,fittingPosition,side.rotation,terminal?1:0,1,1);
        for(const mesh of this.meshes.values())mesh.setColorAt(mesh===this.meshes.get('body')?index:instance,color);
      }
    });
    for(const mesh of this.meshes.values()){
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      if(rebuilt)mesh.computeBoundingSphere();
    }
    return changed;
  }
  stateOf(record){return `${record.x},${record.y}:${record.ductConnections?.map(connection=>`${connection.direction}-${connection.type}`).join(',')||''}:${record.networkStatus||''}:${record.flowRate>0?'flow':'idle'}`;}
  createMesh(name,geometry,count,ids){
    const mesh=new InstancedMesh(geometry,this.material,count);mesh.name=`equipment-duct-${name}`;mesh.userData.equipment=true;mesh.userData.detailed=true;mesh.frustumCulled=false;
    this.scene.add(mesh);this.meshes.set(name,mesh);this.recordIdsByMesh.set(mesh,ids);
  }
  setPart(mesh,index,position,rotation,visible,sx,sy){
    this.dummy.position.set(position.x,visible?position.y:-100,position.z);this.dummy.rotation.set(0,rotation,0);this.dummy.scale.set(visible?sx:0,visible?sy:0,visible?1:0);this.dummy.updateMatrix();mesh.setMatrixAt(index,this.dummy.matrix);
  }
  recordAt(intersection){return this.recordIdsByMesh.get(intersection?.object)?.[intersection.instanceId]||null;}
  clearMeshes(){for(const mesh of this.meshes.values())this.scene.remove(mesh);this.meshes.clear();this.recordIdsByMesh.clear();}
  dispose(){this.clearMeshes();for(const geometry of Object.values(this.geometry))geometry.dispose();this.material.dispose();this.records=[];this.signature='';this.states=[];}
}
