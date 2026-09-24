import { Machine } from './Machine.js';

export class ServerRack extends Machine {
  constructor(x,y,{
    name='Server Rack',
    heatOutput=7000,
    mass=450,
    heatCapacity=520,
    temperature=25,
    startAt=10,
    airIntakeDirection={x:0,y:-1},
    airExhaustDirection={x:0,y:1},
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
    ...rest
  }={}) {
    super(x,y,{name,heatOutput,mass,heatCapacity,temperature,startAt,failureTemperature,category:'serverRack',...rest});
    this.type='serverRack';
    this.airIntakeDirection=airIntakeDirection;
    this.airExhaustDirection=airExhaustDirection;
    this.clientId=clientId;this.contractId=contractId;this.maxPowerKW=maxPowerKW;this.currentPowerKW=currentPowerKW;
    this.heatOutputKW=heatOutputKW;this.inletTemperature=inletTemperature;this.exhaustTemperature=exhaustTemperature;
    this.cpuLoad=cpuLoad;this.uptime=uptime;this.status=status;this.slaTemperature=slaTemperature;this.loadProfile=loadProfile;
    this.uptimeSeconds=0;this.downtimeSeconds=0;
  }
}
