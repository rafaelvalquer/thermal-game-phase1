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

  sourceFace(fan){
    const g=this.grid,d=fan.direction||{x:1,y:0};
    if(d.x>0)return {kind:'u',index:g.uIndex(fan.x+1,fan.y),sign:1};
    if(d.x<0)return {kind:'u',index:g.uIndex(fan.x,fan.y),sign:-1};
    if(d.y>0)return {kind:'v',index:g.vIndex(fan.x,fan.y+1),sign:1};
    return {kind:'v',index:g.vIndex(fan.x,fan.y),sign:-1};
  }

  apply(fan,dt){
    this.applyMomentumSource(fan,dt);
  }

  applyMomentumSource(fan,dt){
    if(!fan.enabled)return;
    const g=this.grid,d=fan.direction||{x:1,y:0};
    const area=fan.faceArea||AIR_FACE_AREA*.52;
    const face=this.sourceFace(fan),field=face.kind==='u'?g.u:g.v;
    const measuredFlow=Math.max(0,field[face.index]*face.sign*area);
    const pressure=this.pressureRise(fan,measuredFlow);
    // A finite actuator region adds momentum before projection. Pressure remains
    // responsible for back pressure and for redistributing incompressible flow.
    const impulse=pressure*dt/(AIR.density*g.dx*AIR.fanSourceSpread);
    const limit=Math.min(AIR.maxVelocity,fan.qFree/area);
    for(let offset=0;offset<AIR.fanSourceSpread;offset++){
      const x=fan.x+d.x*offset,y=fan.y+d.y*offset;
      if(!g.isAir(x,y))break;
      const f=this.sourceFace({...fan,x,y});
      const fx=x+(d.x>0?1:0),fy=y+(d.y>0?1:0);
      if(d.x?g.blockedU(fx,y):g.blockedV(x,fy))break;
      const current=field[f.index]*f.sign;
      field[f.index]=(current+Math.min(impulse,Math.max(0,limit-current)))*f.sign;
    }
  }

  updateDiagnostics(fan){
    const g=this.grid,face=this.sourceFace(fan);
    const field=face.kind==='u'?g.u:g.v;
    const signedVelocity=field[face.index]*face.sign;
    const area=fan.faceArea||AIR_FACE_AREA*.52;
    const flow=fan.enabled?clamp(signedVelocity*area,0,fan.qFree):0;
    fan.currentVelocity=Math.max(0,signedVelocity);
    fan.currentFlow=flow;
    fan.currentPressureRise=this.localPressureDelta(fan);
    fan.availablePressure=this.pressureRise(fan,flow);
    fan.operatingPoint=clamp(flow/Math.max(fan.qFree,1e-6),0,1);
    fan.flowEfficiency=fan.operatingPoint;
    fan.flowCondition=fan.flowEfficiency>=.8?'FREE FLOW':fan.flowEfficiency>=.6?'NORMAL':fan.flowEfficiency>=.4?'HIGH RESISTANCE':fan.flowEfficiency>=.2?'RESTRICTED':'BLOCKED';
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
