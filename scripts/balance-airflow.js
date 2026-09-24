import { pathToFileURL } from 'node:url';
import { createScenario } from './level01-airflow-scenario.js';
import { SimulationConfig } from '../src/simulation/SimulationConfig.js';
import { Fan } from '../src/entities/Fan.js';

const productionFan=new Fan(0,0);

// Examples: node scripts/balance-airflow.js --ua=300,350,400 --q=2.4,2.6
//           node scripts/balance-airflow.js --seconds=1200 --soak
export function measure({qFree=productionFan.qFree,pressure=productionFan.pressureShutoff,forcedUA=SimulationConfig.machineForcedUAperMS,seconds=350,soak=false,strategy='good'}={}){
  if([qFree,pressure,forcedUA,seconds].some(v=>!Number.isFinite(v)||v<=0))throw new Error('Calibration values must be positive numbers');
  const originalUA=SimulationConfig.machineForcedUAperMS;
  try{
    SimulationConfig.machineForcedUAperMS=forcedUA;
    const {world,simulation:s}=createScenario(strategy);
    for(const fan of world.entitiesByType('fan')){fan.qFree=qFree;fan.pressureShutoff=pressure;}
    // Soak is an explicitly extended mission for steady-state measurements.
    if(soak)s.mission.level={...s.mission.level,missionDuration:seconds+1};
    const samples=[];
    for(let step=0;step<seconds*20&&s.mission.state==='running';step++){
      s.update(.05);
      if(step%20===19){samples.push(s.metrics.externalRejectedPower);if(samples.length>30)samples.shift();}
    }
    const machines=world.entities.filter(e=>e.isHeatMachine);
    const room=world.zones.find(z=>z.id==='machine-room');let temperatureSum=0,airCells=0;
    for(let y=room.y;y<room.y+room.height;y++)for(let x=room.x;x<room.x+room.width;x++)if(world.isAir(x,y)){temperatureSum+=world.temperatureAt(x,y);airCells++;}
    return {qFree,pressure,UA:forcedUA,M1:machines[0].temperature.toFixed(2),M2:machines[1].temperature.toFixed(2),M3:machines[2].temperature.toFixed(2),won:s.mission.state==='won',elapsed:s.elapsed.toFixed(1),generatedHeatPower:s.metrics.generatedHeatPower,exhaustRejectedPower:Math.round(s.metrics.exhaustRejectedPower),machineCoolingPower:Math.round(s.metrics.machineCoolingPower),averageRoomTemp:(temperatureSum/airCells).toFixed(2),maxMachineTemp:Math.max(...machines.map(e=>e.temperature)).toFixed(2),fanOperatingPoint:world.airDiagnostics.averageFanOperatingPoint.toFixed(3),averageExternalRejection:Math.round(samples.reduce((sum,v)=>sum+v,0)/Math.max(1,samples.length)),energyError:s.metrics.energyBalance};
  }finally{SimulationConfig.machineForcedUAperMS=originalUA;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=new Map(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
  const numbers=(name,fallback)=>(args.get(name)||fallback).split(',').map(Number);
  const rows=[];
  for(const qFree of numbers('q',String(productionFan.qFree)))for(const pressure of numbers('pressure',String(productionFan.pressureShutoff)))for(const forcedUA of numbers('ua',String(SimulationConfig.machineForcedUAperMS))){
    if([qFree,pressure,forcedUA].some(v=>!Number.isFinite(v)||v<=0))throw new Error('Calibration values must be positive numbers');
    const row=measure({qFree,pressure,forcedUA,seconds:Number(args.get('seconds')||350),soak:args.has('soak'),strategy:args.get('strategy')||'good'});
    rows.push(row);console.log(JSON.stringify(row));
  }
  console.table(rows);
}
