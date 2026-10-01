import { AmbientLight, Color, DirectionalLight, Fog, HemisphereLight, PCFSoftShadowMap, PerspectiveCamera, Raycaster, Scene, Vector2, WebGLRenderer } from 'three';
import { RendererAdapter } from './RendererAdapter.js';
import { World3DBuilder } from './world/World3DBuilder.js';
import { Equipment3DFactory } from './equipment/Equipment3DFactory.js';
import { THREE_QUALITY } from './visual/ThreeQuality.js';
import { AirflowParticleOverlay3D } from './visual/AirflowParticleOverlay3D.js';
import { EquipmentAnimationSystem } from './equipment/EquipmentAnimationSystem.js';

export class ThreeRenderer {
  constructor({quality='medium',canvas=null}={}){
    this.qualityName=THREE_QUALITY[quality]?quality:'medium';this.quality=THREE_QUALITY[this.qualityName];
    const renderer=new WebGLRenderer({canvas:canvas||undefined,antialias:this.quality.shadows,alpha:false,powerPreference:'high-performance'});
    this.adapter=new RendererAdapter(renderer);this.canvas=this.adapter.domElement;
    this.scene=new Scene();this.scene.background=new Color('#07111c');this.scene.fog=new Fog('#07111c',45,Math.max(120,this.quality.drawDistance*1.8));
    this.camera=new PerspectiveCamera(55,1,.1,800);this.camera.position.set(35,38,42);
    this.scene.add(new HemisphereLight('#c8e8ff','#17212b',2.1));this.scene.add(new AmbientLight('#d8e4ef',.46));
    const key=new DirectionalLight('#fff1d7',2.25);key.position.set(-38,60,-20);key.castShadow=this.quality.shadows;key.shadow.mapSize.set(1024,1024);this.keyLight=key;this.scene.add(key);
    const fill=new DirectionalLight('#64c6ed',.8);fill.position.set(30,24,40);this.scene.add(fill);
    this.worldBuilder=new World3DBuilder(this.scene);this.equipment=new Equipment3DFactory(this.scene);this.equipmentAnimation=new EquipmentAnimationSystem();this.airflowParticles=new AirflowParticleOverlay3D(this.scene,this.quality.airflowParticles);this.raycaster=new Raycaster();this.pointer=new Vector2();
    this.snapshot=null;this.overlay='normal';this.selectedId=null;this.disposed=false;this.lastAirVersion=-1;
    this.adapter.renderer.outputColorSpace='srgb';this.adapter.renderer.toneMappingExposure=1;
  }
  get domElement(){return this.canvas;}
  setOverlay(mode){this.overlay=['normal','thermal','airflow','power','cooling','water','alarms','contracts'].includes(mode)?mode:'normal';}
  render(snapshot,{overlay=this.overlay,ceiling=false,dt=1/60}={}){
    if(this.disposed||!snapshot)return;
    this.snapshot=snapshot;this.worldBuilder.build(snapshot);this.equipment.sync(snapshot);this.equipmentAnimation.update(snapshot,dt,this.equipment);this.worldBuilder.setCeilingVisible(ceiling);
    this.worldBuilder.updateOverlay(snapshot,overlay);this.airflowParticles.update(snapshot,dt,overlay==='airflow');this.overlay=overlay;
    this.adapter.render(this.scene,this.camera);
  }
  setQuality(name){
    if(!THREE_QUALITY[name]||name===this.qualityName)return false;
    this.qualityName=name;this.quality=THREE_QUALITY[name];this.adapter.renderer.shadowMap.enabled=this.quality.shadows;this.adapter.renderer.shadowMap.type=PCFSoftShadowMap;
    this.keyLight.castShadow=this.quality.shadows;this.scene.fog.far=Math.max(120,this.quality.drawDistance*1.8);this.resize();return true;
  }
  resize(){
    const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    this.adapter.setPixelRatio(Math.min(window.devicePixelRatio||1,this.quality.pixelRatio));this.adapter.setSize(width,height,false);
  }
  pick(clientX,clientY){
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const intersections=this.raycaster.intersectObjects(this.equipment.getPickableMeshes(),false);
    for(const hit of intersections){const id=this.equipment.recordAt(hit);if(id)return this.snapshot?.equipment.find(record=>record.id===id)||null;}
    return null;
  }
  pickCenter(){const rect=this.canvas.getBoundingClientRect();return this.pick(rect.left+rect.width/2,rect.top+rect.height/2);}
  checksum(){return {equipmentIds:this.equipment.getEquipmentIds(),meshIds:this.equipment.getMeshIds()};}
  dispose(){if(this.disposed)return;this.disposed=true;this.equipmentAnimation.dispose();this.worldBuilder.dispose();this.equipment.dispose();this.airflowParticles.dispose(this.scene);this.adapter.dispose();this.scene.clear();}
}
