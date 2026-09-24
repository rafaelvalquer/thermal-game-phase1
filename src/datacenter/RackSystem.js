import { clamp } from '../utils/MathUtils.js';

const PROFILES={
  banking:[[0,.3],[6,.45],[9,.9],[12,1],[18,.8],[23,.4]],
  streaming:[[0,.8],[6,.25],[12,.45],[18,.95],[22,1]],
};

function interpolateProfile(points,hour){
  const next=points.findIndex(point=>point[0]>=hour);
  if(next===0)return points[0][1];
  if(next<0){const [h0,v0]=points.at(-1),[h1,v1]=[24,points[0][1]];return v0+(v1-v0)*(hour-h0)/(h1-h0);}
  const [h1,v1]=points[next],[h0,v0]=points[next-1];return v0+(v1-v0)*(hour-h0)/(h1-h0);
}

export class RackSystem {
  constructor(world,contracts){this.world=world;this.contracts=contracts;}
  profileLoad(profile,hour,index,seconds){
    if(profile==='ai')return .5+.5*(.5+.5*Math.sin(seconds/173+index*2.17));
    return clamp(interpolateProfile(PROFILES[profile]||[[0,.55],[12,.75],[20,.6]],hour),.05,1);
  }
  update(dt,clock){
    let index=0;
    for(const rack of this.world.entitiesByType('serverRack')){
      if(!rack.contractId)continue;
      const contract=this.contracts.state.contracts.find(item=>item.id===rack.contractId),live=contract&&['installing','active'].includes(contract.status);
      if(!live){rack.enabled=false;rack.power=0;rack.heatOutput=0;rack.heatGenerationPower=0;rack.status='CANCELLED';continue;}
      rack.enabled=true;
      rack.cpuLoad=this.profileLoad(rack.loadProfile,clock.hour,index++,clock.seconds);
      rack.currentPowerKW=rack.maxPowerKW*rack.cpuLoad;
      rack.heatOutput=rack.maxPowerKW*1000*.98;
      rack.heatOutputKW=rack.currentPowerKW*.98;
      rack.power=rack.currentPowerKW*1000;
      rack.loadMultiplier=rack.cpuLoad;
      rack.slaTemperature=contract.maxInletTemperature;
      const ix=rack.x+rack.airIntakeDirection.x,iy=rack.y+rack.airIntakeDirection.y;
      if(this.world.inBounds(ix,iy)&&this.world.isAir(ix,iy))rack.inletTemperature=this.world.temperatureAt(ix,iy);
      const ex=rack.x+rack.airExhaustDirection.x,ey=rack.y+rack.airExhaustDirection.y;
      if(this.world.inBounds(ex,ey)&&this.world.isAir(ex,ey))rack.exhaustTemperature=this.world.temperatureAt(ex,ey);
      if(rack.inletTemperature>rack.slaTemperature){rack.status='HOT';contract.dailyViolation=contract.status==='active';}
      else rack.status=contract.status==='active'?'NORMAL':'INSTALLING';
    }
  }
  afterThermalStep(dt){
    for(const rack of this.world.entitiesByType('serverRack')){
      if(!rack.contractId||rack.status==='CANCELLED')continue;
      const contract=this.contracts.state.contracts.find(item=>item.id===rack.contractId);
      if(!contract||contract.status!=='active')continue;
      contract.activeSeconds+=dt;
      if(rack.inletTemperature<=rack.slaTemperature){contract.uptimeSeconds+=dt;rack.uptimeSeconds+=dt;}
      else{contract.downtimeSeconds+=dt;rack.downtimeSeconds+=dt;}
      const total=contract.uptimeSeconds+contract.downtimeSeconds;
      rack.uptime=total?100*contract.uptimeSeconds/total:100;
      contract.dailyActiveSeconds=(contract.dailyActiveSeconds||0)+dt;
      if(rack.inletTemperature<=rack.slaTemperature)contract.dailyUptimeSeconds=(contract.dailyUptimeSeconds||0)+dt;
      else contract.dailyDowntimeSeconds=(contract.dailyDowntimeSeconds||0)+dt;
    }
  }
  evaluateDailyAvailability(){
    for(const contract of this.contracts.state.contracts){
      if(contract.status!=='active'||contract.dailyActiveSeconds<=0)continue;
      const availability=100*contract.dailyUptimeSeconds/contract.dailyActiveSeconds;
      if(availability<contract.availability)contract.dailyViolation=true;
    }
  }
  evaluateContracts(metrics){
    const facilityOverload=metrics.powerDraw>this.world.datacenter.powerGrid.capacityKW*1000;
    if(!facilityOverload)return;
    for(const contract of this.contracts.state.contracts)if(contract.status==='active')contract.dailyViolation=true;
  }
}
