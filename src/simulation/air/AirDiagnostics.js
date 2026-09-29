import { isPowered } from '../PowerState.js';
export class AirDiagnostics {
  constructor(grid){this.grid=grid;this.values={};}

  update(values=null){
    const g=this.grid;
    if(!values){
      let maxVelocity=0,sumVelocity=0,count=0,maxPressure=-Infinity,minPressure=Infinity,maxDivergence=0;
      for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
        const i=g.cellIndex(x,y);if(g.solid[i])continue;
        const vx=.5*(g.u[g.uIndex(x,y)]+g.u[g.uIndex(x+1,y)]),vy=.5*(g.v[g.vIndex(x,y)]+g.v[g.vIndex(x,y+1)]),speed=Math.hypot(vx,vy);
        maxVelocity=Math.max(maxVelocity,speed);sumVelocity+=speed;count++;
        maxPressure=Math.max(maxPressure,g.pressure[i]);minPressure=Math.min(minPressure,g.pressure[i]);
        maxDivergence=Math.max(maxDivergence,Math.abs(g.divergence[i]));
      }
      values={maxVelocity,averageVelocity:count?sumVelocity/count:0,maxPressure:Number.isFinite(maxPressure)?maxPressure:0,minPressure:Number.isFinite(minPressure)?minPressure:0,maxDivergence};
    }
    this.values={...values};
    for(const [type,label] of [['fan','Fan'],['exhaust','Exhaust']]){
      const equipment=[...g.world.entitySetByType(type)].filter(isPowered);
      this.values[type==='fan'?'fanCount':'exhaustCount']=equipment.length;
      this.values['total'+label+'FreeFlow']=equipment.reduce((s,e)=>s+e.qFree,0);
      this.values['total'+label+'ActualFlow']=equipment.reduce((s,e)=>s+e.currentFlow,0);
      this.values['average'+label+'OperatingPoint']=equipment.length?equipment.reduce((s,e)=>s+e.flowEfficiency,0)/equipment.length:0;
    }
    g.world.airDiagnostics=this.values;
    return this.values;
  }
}
