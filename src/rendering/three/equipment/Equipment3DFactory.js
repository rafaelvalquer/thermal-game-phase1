import { BoxGeometry, Color, CylinderGeometry, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { coordinateMapper } from '../../../bridge/CoordinateMapper.js';
import { DetailedEquipment3DFactory } from './DetailedEquipment3DFactory.js';

const COLORS={serverRack:'#2b3540',computeRackCpu:'#167c54',computeRackGpu:'#6641a5',computeRackStorage:'#167b93',coolingUnit:'#507080',supplyVent:'#92aab6',duct:'#51616d',fan:'#536b80',exhaust:'#42677c',pipe:'#ce8f48',pump:'#39758a',tank:'#307d8c',radiator:'#5b8090',exchanger:'#9c7650',waterChiller:'#327c86',solarPanel:'#287ba0',battery:'#547064',furnace:'#9b5038',machine:'#566677',sensor:'#c0a046'};
const DATA={
  supplyVent:{geometry:new BoxGeometry(.82,.12,.82),height:2.9,color:COLORS.supplyVent},
  duct:{geometry:new BoxGeometry(.42,.2,.42),height:2.85,color:COLORS.duct},fan:{geometry:new CylinderGeometry(.36,.36,.12,12),height:2.92,color:COLORS.fan},exhaust:{geometry:new CylinderGeometry(.4,.4,.13,12),height:2.9,color:COLORS.exhaust},
  pipe:{geometry:new CylinderGeometry(.075,.075,.82,8),height:2.72,color:COLORS.pipe},pump:{geometry:new BoxGeometry(.72,.68,.72),height:.35,color:COLORS.pump},tank:{geometry:new CylinderGeometry(.36,.36,.92,12),height:.48,color:COLORS.tank},
  radiator:{geometry:new BoxGeometry(.9,.72,.3),height:.38,color:COLORS.radiator},exchanger:{geometry:new BoxGeometry(.82,.78,.45),height:.4,color:COLORS.exchanger},waterChiller:{geometry:new BoxGeometry(.98,1.06,.86),height:.53,color:COLORS.waterChiller},
  solarPanel:{geometry:new BoxGeometry(.9,.12,.86),height:.08,color:COLORS.solarPanel},battery:{geometry:new BoxGeometry(.72,1.04,.68),height:.52,color:COLORS.battery},furnace:{geometry:new BoxGeometry(.92,1.2,.84),height:.6,color:COLORS.furnace},machine:{geometry:new BoxGeometry(.92,1.4,.88),height:.7,color:COLORS.machine},sensor:{geometry:new BoxGeometry(.26,.3,.22),height:2.55,color:COLORS.sensor},
};
const colorFor=record=>record.type==='computeRack'?COLORS['computeRack'+({cpu:'Cpu',gpu:'Gpu',storage:'Storage'}[record.specialization]||'Cpu')]:COLORS[record.type]||'#768493';
const visualType=record=>record.type==='computeRack'?'computeRack'+({cpu:'Cpu',gpu:'Gpu',storage:'Storage'}[record.specialization]||'Cpu'):record.type==='coolingUnit'?'coolingUnit'+(record.footprintLength>1?'Industrial':'Commercial'):record.type;
const detailedType=kind=>kind==='serverRack'||kind.startsWith('computeRack')||kind.startsWith('coolingUnit');

export class Equipment3DFactory {
  constructor(scene){this.scene=scene;this.meshes=new Map();this.recordIdsByMesh=new Map();this.meshStateByType=new Map();this.detailed=new DetailedEquipment3DFactory(scene);this.records=[];this.revision=-1;this.structureSignature='';this.disposed=false;this.dummy=new Object3D();this.color=new Color();}
  sync(snapshot,{force=false}={}){
    const records=snapshot.equipment.filter(record=>DATA[visualType(record)]||detailedType(visualType(record))),buckets=new Map(),detailedBuckets=new Map();
    for(const record of records){const kind=visualType(record),target=detailedType(kind)?detailedBuckets:buckets,list=target.get(kind)||[];list.push(record);target.set(kind,list);}
    const structureSignature=[...buckets].map(([kind,items])=>kind+':'+items.map(item=>item.id).join(',')).join('|');
    let structuralChange=force||structureSignature!==this.structureSignature;
    if(structuralChange){this.clearMeshes();this.structureSignature=structureSignature;for(const [kind,items] of buckets)this.createBucket(kind,items);}
    let changed=structuralChange;this.records=records;this.revision=snapshot.version;
    for(const [kind,items] of buckets){
      const mesh=this.meshes.get(kind),state=this.meshStateByType.get(kind);let matrixDirty=false,colorDirty=false;
      items.forEach((record,index)=>{
        const signature=this.instanceSignature(record),previous=state.signatures[index];if(!structuralChange&&signature===previous)return;
        if(structuralChange||record.x!==state.positions[index].x||record.y!==state.positions[index].y||record.rotation!==state.positions[index].rotation||record.footprintLength!==state.positions[index].footprintLength){
          this.setInstanceTransform(mesh,index,record,kind);state.positions[index]={x:record.x,y:record.y,rotation:record.rotation,footprintLength:record.footprintLength};matrixDirty=true;
        }
        if(structuralChange||record.status!==state.statuses[index]||record.enabled!==state.enabled[index]||record.powerBlocked!==state.powerBlocked[index]||record.occupancy!==state.occupancies[index]){
          this.setInstanceColor(mesh,index,record);state.statuses[index]=record.status;state.enabled[index]=record.enabled;state.powerBlocked[index]=record.powerBlocked;state.occupancies[index]=record.occupancy;colorDirty=true;
        }
        state.signatures[index]=signature;changed=true;
      });
      if(matrixDirty)mesh.instanceMatrix.needsUpdate=true;if(colorDirty&&mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    return this.detailed.sync(detailedBuckets)||changed;
  }
  createBucket(kind,records){
    const spec=DATA[kind],material=new MeshStandardMaterial({color:'#ffffff',roughness:.58,metalness:.42}),mesh=new InstancedMesh(spec.geometry,material,records.length);
    mesh.name='equipment-'+kind;mesh.instanceMatrix.setUsage(35048);mesh.userData.equipment=true;this.scene.add(mesh);this.meshes.set(kind,mesh);this.recordIdsByMesh.set(mesh,records.map(record=>record.id));
    this.meshStateByType.set(kind,{signatures:Array(records.length).fill(''),statuses:Array(records.length),enabled:Array(records.length),powerBlocked:Array(records.length),occupancies:Array(records.length),positions:Array(records.length).fill(null)});
  }
  instanceSignature(record){return [record.x,record.y,record.rotation,record.footprintLength,record.status,record.enabled,record.powerBlocked,record.utilization,record.occupancy,record.contractIds.join(',')].join('|');}
  setInstanceTransform(mesh,index,record,kind){
    const spec=DATA[kind],position=coordinateMapper.tileCenter(record.x,record.y,spec.height);this.dummy.position.set(position.x,position.y,position.z);
    const directional=['coolingUnit','supplyVent','fan','exhaust','pump','radiator','serverRack','computeRackCpu','computeRackGpu','computeRackStorage'];
    this.dummy.rotation.set(0,directional.includes(kind)?coordinateMapper.directionToYaw(record.direction||{x:0,y:-1}):record.rotation||0,0);
    if(kind==='duct'||kind==='pipe')this.dummy.rotation.z=Math.PI/2;
    const alongZ=Math.abs(record.direction?.y||0)>Math.abs(record.direction?.x||0);
    if(kind==='coolingUnit'&&record.footprintLength>1)this.dummy.scale.set(alongZ?1:record.footprintLength,1,alongZ?record.footprintLength:1);else this.dummy.scale.set(1,1,1);
    this.dummy.updateMatrix();mesh.setMatrixAt(index,this.dummy.matrix);
  }
  setInstanceColor(mesh,index,record){
    const status=record.status==='alarm'?'#ff4055':record.status==='blocked'?'#80848d':record.status==='off'?'#515965':colorFor(record);
    const color=this.color.set(status);
    if((record.type==='computeRack'||record.type==='serverRack')&&record.occupancy>0)color.lerp(new Color('#f0ab45'),Math.min(.42,record.occupancy*.42));
    mesh.setColorAt(index,color);
  }
  recordAt(intersection){const ids=this.recordIdsByMesh.get(intersection?.object);return ids?.[intersection.instanceId]||this.detailed.recordAt(intersection);}
  getPickableMeshes(){return [...this.meshes.values(),...this.detailed.meshes.values()];}
  getMeshIds(){return [...new Set([...this.recordIdsByMesh.values(),...this.detailed.recordIdsByMesh.values()].flat())].sort();}
  animate(phases,blinkOn){this.detailed.animate(phases,blinkOn);}
  getEquipmentIds(){return this.records.map(record=>record.id).sort();}
  clearMeshes(){for(const mesh of this.meshes.values()){this.scene.remove(mesh);mesh.material.dispose();}this.meshes.clear();this.recordIdsByMesh.clear();this.meshStateByType.clear();}
  dispose(){this.clearMeshes();this.detailed.dispose();for(const spec of Object.values(DATA))spec.geometry.dispose();this.disposed=true;}
}
