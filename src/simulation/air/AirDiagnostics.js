export class AirDiagnostics {
  constructor(grid){this.grid=grid;this.values={};}

  update(){
    const g=this.grid;
    let maxVelocity=0,sumVelocity=0,count=0,maxPressure=-Infinity,minPressure=Infinity,maxDivergence=0;

    for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
      if(!g.isAir(x,y))continue;
      const i=g.cellIndex(x,y),v=g.cellVelocity(x,y),speed=Math.hypot(v.x,v.y);
      maxVelocity=Math.max(maxVelocity,speed);sumVelocity+=speed;count++;
      maxPressure=Math.max(maxPressure,g.pressure[i]);minPressure=Math.min(minPressure,g.pressure[i]);
      maxDivergence=Math.max(maxDivergence,Math.abs(g.divergence[i]));
    }

    this.values={
      maxVelocity,
      averageVelocity:count?sumVelocity/count:0,
      maxPressure:Number.isFinite(maxPressure)?maxPressure:0,
      minPressure:Number.isFinite(minPressure)?minPressure:0,
      maxDivergence,
    };
    for(const [type,label] of [['fan','Fan'],['exhaust','Exhaust']]){
      const equipment=g.world.entities.filter(e=>e.type===type&&e.enabled);
      this.values[type==='fan'?'fanCount':'exhaustCount']=equipment.length;
      this.values['total'+label+'FreeFlow']=equipment.reduce((s,e)=>s+e.qFree,0);
      this.values['total'+label+'ActualFlow']=equipment.reduce((s,e)=>s+e.currentFlow,0);
      this.values['average'+label+'OperatingPoint']=equipment.length?equipment.reduce((s,e)=>s+e.flowEfficiency,0)/equipment.length:0;
    }
    g.world.airDiagnostics=this.values;
    return this.values;
  }
}
