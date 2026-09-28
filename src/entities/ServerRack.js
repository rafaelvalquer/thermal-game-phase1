import { Machine } from './Machine.js';

export class ServerRack extends Machine {
  static normalizeIntakeDirection(direction){
    const x=Number(direction?.x)||0,y=Number(direction?.y)||0;
    if(Math.abs(x)<1e-9&&Math.abs(y)<1e-9)return {x:0,y:-1};
    return Math.abs(x)>=Math.abs(y)?{x:Math.sign(x),y:0}:{x:0,y:Math.sign(y)};
  }

  constructor(x,y,{
    name='Server Rack',
    heatOutput=7000,
    mass=450,
    heatCapacity=520,
    temperature=25,
    startAt=10,
    airIntakeDirection=null,
    airExhaustDirection=null,
    failureTemperature=55,
    clientId=null,
    contractId=null,
    maxPowerKW=heatOutput/1000,
    currentPowerKW=maxPowerKW,
    heatOutputKW=maxPowerKW*.98,
    inletTemperature=temperature,
    exhaustTemperature=temperature,
    cpuLoad=1,
    uptime=100,
    status='NORMAL',
    slaTemperature=30,
    loadProfile='fixed',
    thermalViolationSeconds=0,
    thermalViolationTimebase='simulation',
    ...rest
  }={}) {
    super(x,y,{name,heatOutput,mass,heatCapacity,temperature,startAt,failureTemperature,category:'serverRack',...rest});
    this.type='serverRack';
    const legacyExhaust=airIntakeDirection==null&&airExhaustDirection!=null;
    const requestedIntake=legacyExhaust?{x:-airExhaustDirection.x,y:-airExhaustDirection.y}:airIntakeDirection;
    this.airIntakeDirection=ServerRack.normalizeIntakeDirection(requestedIntake||{x:0,y:-1});
    this.airExhaustDirection={x:this.airIntakeDirection.x===0?0:-this.airIntakeDirection.x,y:this.airIntakeDirection.y===0?0:-this.airIntakeDirection.y};
    this.clientId=clientId;this.contractId=contractId;this.maxPowerKW=maxPowerKW;this.currentPowerKW=currentPowerKW;
    this.heatOutputKW=heatOutputKW;this.inletTemperature=inletTemperature;this.exhaustTemperature=exhaustTemperature;
    this.cpuLoad=cpuLoad;this.uptime=uptime;this.status=status;this.slaTemperature=slaTemperature;this.loadProfile=loadProfile;
    this.thermalViolationSeconds=Math.max(0,Number(thermalViolationSeconds)||0);
    this.thermalViolationTimebase=thermalViolationTimebase;
    this.uptimeSeconds=0;this.downtimeSeconds=0;
  }

  normalizeAirflowDirections(){
    this.airIntakeDirection=ServerRack.normalizeIntakeDirection(this.airIntakeDirection);
    this.airExhaustDirection={x:this.airIntakeDirection.x===0?0:-this.airIntakeDirection.x,y:this.airIntakeDirection.y===0?0:-this.airIntakeDirection.y};
  }
}
