import { isPowered } from '../simulation/PowerState.js';
import { clamp } from '../utils/MathUtils.js';

const PROFILES={
  banking:[[0,.3],[6,.45],[9,.9],[12,1],[18,.8],[23,.4]],
  streaming:[[0,.8],[6,.25],[12,.45],[18,.95],[22,1]],
};
const THERMAL_SLA_GRACE_SECONDS=60;

function interpolateProfile(points,hour){
  const next=points.findIndex(point=>point[0]>=hour);
  if(next===0)return points[0][1];
  if(next<0){const [h0,v0]=points.at(-1),[h1,v1]=[24,points[0][1]];return v0+(v1-v0)*(hour-h0)/(h1-h0);}
  const [h1,v1]=points[next],[h0,v0]=points[next-1];return v0+(v1-v0)*(hour-h0)/(h1-h0);
}

export class RackSystem {
  constructor(world,contracts){this.world=world;this.contracts=contracts;}
  release(rack){
    rack.enabled=false;rack.powerBlocked=false;rack.power=0;rack.requestedPower=0;
    rack.contractId=null;rack.clientId=null;rack.clientName=null;rack.name='Rack disponível';
    rack.maxPowerKW=0;rack.currentPowerKW=0;rack.cpuLoad=0;rack.loadMultiplier=0;
    rack.heatOutput=0;rack.baseHeatOutput=0;rack.heatOutputKW=0;rack.heatGenerationPower=0;
    rack.started=false;rack.status='CANCELLED';rack.thermalViolationSeconds=0;rack.coolingPower=0;rack.thermalBalance=0;
    rack.uptimeSeconds=0;rack.downtimeSeconds=0;rack.uptime=100;
  }
  profileLoad(profile,hour,index,seconds){
    if(profile==='ai')return .5+.5*(.5+.5*Math.sin(seconds/173+index*2.17));
    return clamp(interpolateProfile(PROFILES[profile]||[[0,.55],[12,.75],[20,.6]],hour),.05,1);
  }
  update(dt,clock){
    let index=0;
    for(const rack of this.world.entitySetByType('serverRack')){
      if(!rack.contractId)continue;
      const contract=this.contracts.getById(rack.contractId),live=contract&&['installing','active'].includes(contract.status);
      if(!live){this.release(rack);continue;}
      rack.cpuLoad=this.profileLoad(rack.loadProfile,clock.hour,index++,clock.seconds);
      rack.currentPowerKW=rack.maxPowerKW*rack.cpuLoad;
      rack.heatOutput=rack.maxPowerKW*1000*.98;
      rack.heatOutputKW=rack.currentPowerKW*.98;
      rack.requestedPower=rack.currentPowerKW*1000;
      rack.power=isPowered(rack)?rack.requestedPower:0;
      if(!isPowered(rack)){rack.currentPowerKW=0;rack.heatOutputKW=0;rack.heatGenerationPower=0;}
      rack.loadMultiplier=rack.cpuLoad;
      rack.slaTemperature=contract.maxInletTemperature;
      const ix=rack.x+rack.airIntakeDirection.x,iy=rack.y+rack.airIntakeDirection.y;
      if(this.world.inBounds(ix,iy)&&this.world.isAir(ix,iy))rack.inletTemperature=this.world.temperatureAt(ix,iy);
      const ex=rack.x+rack.airExhaustDirection.x,ey=rack.y+rack.airExhaustDirection.y;
      if(this.world.inBounds(ex,ey)&&this.world.isAir(ex,ey))rack.exhaustTemperature=this.world.temperatureAt(ex,ey);
      if(rack.inletTemperature>rack.slaTemperature)rack.status='HOT';
      else if(!isPowered(rack))rack.status=rack.powerBlocked?'POWER_OFF':'OFF';
      else rack.status=contract.status==='active'?'NORMAL':'INSTALLING';
    }
  }
  afterThermalStep(dt,simulationDt=dt){
    for(const rack of this.world.entitySetByType('serverRack')){
      if(!rack.contractId||rack.status==='CANCELLED')continue;
      const contract=this.contracts.getById(rack.contractId);
      if(!contract||contract.status!=='active')continue;
      contract.activeSeconds+=dt;
      const hot=rack.inletTemperature>rack.slaTemperature,previousViolationSeconds=rack.thermalViolationSeconds||0;
      const nextViolationSeconds=hot?previousViolationSeconds+simulationDt:0;
      rack.thermalViolationSeconds=nextViolationSeconds;
      const thermalDowntimeSimulation=hot
        ?Math.max(0,nextViolationSeconds-THERMAL_SLA_GRACE_SECONDS)-Math.max(0,previousViolationSeconds-THERMAL_SLA_GRACE_SECONDS)
        :0;
      const thermalDowntime=simulationDt>0?thermalDowntimeSimulation/simulationDt*dt:0;
      if(nextViolationSeconds>THERMAL_SLA_GRACE_SECONDS)contract.dailyViolation=true;
      const downtime=isPowered(rack)?thermalDowntime:dt,uptime=dt-downtime;
      contract.uptimeSeconds+=uptime;rack.uptimeSeconds+=uptime;
      contract.downtimeSeconds+=downtime;rack.downtimeSeconds+=downtime;
      const total=rack.uptimeSeconds+rack.downtimeSeconds;
      rack.uptime=total?100*rack.uptimeSeconds/total:100;
      contract.dailyActiveSeconds=(contract.dailyActiveSeconds||0)+dt;
      contract.dailyUptimeSeconds=(contract.dailyUptimeSeconds||0)+uptime;
      contract.dailyDowntimeSeconds=(contract.dailyDowntimeSeconds||0)+downtime;
    }
  }
  evaluateDailyAvailability(){
    for(const contract of this.contracts.state.contracts){
      if(contract.status!=='active'||contract.dailyActiveSeconds<=0)continue;
      const availability=100*contract.dailyUptimeSeconds/contract.dailyActiveSeconds;
      if(availability<contract.availability)contract.dailyViolation=true;
    }
  }
}
