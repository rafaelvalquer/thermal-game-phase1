import { AIR_FACE_AREA, AIR } from './AirConstants.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class FanModel {
  constructor(grid){this.grid=grid;}

  pressureRise(fan,flow){
    const ratio=clamp(Math.abs(flow)/Math.max(fan.qFree,1e-6),0,1);
    return Math.max(0,fan.pressureShutoff*(1-ratio*ratio));
  }

  localPressureDelta(fan){
    const g=this.grid,d=fan.direction||{x:1,y:0};
    const up={x:fan.x-d.x,y:fan.y-d.y},down={x:fan.x+d.x,y:fan.y+d.y};
    const p=(c)=>g.inCell(c.x,c.y)&&!g.isSolid(c.x,c.y)?g.pressure[g.cellIndex(c.x,c.y)]:0;
    return Math.max(0,p(down)-p(up));
  }

  targetFlow(fan){
    const dp=this.localPressureDelta(fan);
    const ratio=clamp(1-dp/Math.max(fan.pressureShutoff,1e-6),0,1);
    return fan.qFree*Math.sqrt(ratio);
  }

  sourceFace(fan){
    const g=this.grid,d=fan.direction||{x:1,y:0};
    if(d.x>0)return {kind:'u',index:g.uIndex(fan.x+1,fan.y),sign:1};
    if(d.x<0)return {kind:'u',index:g.uIndex(fan.x,fan.y),sign:-1};
    if(d.y>0)return {kind:'v',index:g.vIndex(fan.x,fan.y+1),sign:1};
    return {kind:'v',index:g.vIndex(fan.x,fan.y),sign:-1};
  }

  apply(fan,dt){
    if(!fan.enabled)return;
    const g=this.grid,face=this.sourceFace(fan);
    const targetFlow=this.targetFlow(fan);
    const area=fan.faceArea||AIR_FACE_AREA*.52;
    const targetVelocity=targetFlow/Math.max(area,1e-6);
    const field=face.kind==='u'?g.u:g.v;
    const response=1-Math.exp(-AIR.fanResponse*dt);
    const currentSigned=field[face.index]*face.sign;
    const next=currentSigned+(targetVelocity-currentSigned)*response;
    field[face.index]=clamp(next,-AIR.maxVelocity,AIR.maxVelocity)*face.sign;
  }

  updateDiagnostics(fan){
    const g=this.grid,face=this.sourceFace(fan);
    const field=face.kind==='u'?g.u:g.v;
    const signedVelocity=field[face.index]*face.sign;
    const area=fan.faceArea||AIR_FACE_AREA*.52;
    const flow=Math.max(0,signedVelocity*area);
    fan.currentVelocity=Math.max(0,signedVelocity);
    fan.currentFlow=flow;
    fan.currentPressureRise=this.localPressureDelta(fan);
    fan.availablePressure=this.pressureRise(fan,flow);
    fan.operatingPoint=clamp(flow/Math.max(fan.qFree,1e-6),0,1);
    fan.airflow=fan.currentVelocity;
  }

  applyAll(dt){
    for(const fan of this.grid.world.entities){
      if(fan.type==='fan'||fan.type==='exhaust')this.apply(fan,dt);
    }
  }

  updateAllDiagnostics(){
    for(const fan of this.grid.world.entities){
      if(fan.type==='fan'||fan.type==='exhaust')this.updateDiagnostics(fan);
    }
  }
}
