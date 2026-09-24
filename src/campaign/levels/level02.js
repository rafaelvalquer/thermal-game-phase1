import { level02Map } from '../maps/level02Map.js';

export const level02={
  id:'ventilation-corridor',number:2,name:'Ventilation Corridor',difficulty:2,
  tagline:'Airflow e corredores',
  description:'Duas salas industriais dependem de um corredor central para levar ar quente até a exaustão.',
  briefing:'A geometria agora importa. Use uma condensadora, ramifique os dutos até várias saídas e compare como a distância reduz a eficiência.',
  thermalSystems:{simpleCooling:true,waterCooling:true,coolingUnitModel:'commercial'},
  map:level02Map,environment:{outdoorTemperature:25},budget:18000,powerLimit:10000,missionDuration:240,
  inventory:{pipe:32,pump:1,tank:1,radiator:2,exchanger:2,wall:20,insulation:30,copper:0,fan:6,exhaust:2,sensor:6,coolingUnit:1,duct:160,supplyVent:3,demolish:Infinity},
  zones:[
    {id:'room-a',name:'Sala A',x:9,y:10,width:15,height:14,target:38,visualStyle:'industrial'},
    {id:'room-b',name:'Sala B',x:36,y:10,width:15,height:14,target:38,visualStyle:'industrial'},
    {id:'main-corridor',name:'Corredor Principal',x:5,y:25,width:54,height:9,target:42,visualStyle:'corridor'},
  ],
  entities:[
    {type:'machine',id:'corridor-m1',name:'Compressor A',x:16,y:15,heatOutput:10000,zoneId:'room-a',category:'process'},
    {type:'machine',id:'corridor-m2',name:'Compressor B',x:43,y:15,heatOutput:14000,zoneId:'room-b',category:'process'},
  ],
  objectives:[
    {type:'zoneTemperature',zoneId:'room-a',metric:'max',max:38,label:'Sala A < 38°C'},
    {type:'zoneTemperature',zoneId:'room-b',metric:'max',max:38,label:'Sala B < 38°C'},
    {type:'zoneTemperature',zoneId:'main-corridor',metric:'max',max:42,label:'Corredor < 42°C'},
    {type:'powerBelow',max:6000,label:'Potência < 6 kW'},
  ],
  failures:[
    {type:'machineOverheat',temperature:80,hold:30},
    {type:'zoneOverheat',zoneId:'main-corridor',temperature:65,hold:30,message:'O corredor principal entrou em colapso térmico.'},
  ],
  events:[],
  tips:['Uma única condensadora pode alimentar várias saídas.','Cada ramal compartilha a vazão; ramais mais longos perdem eficiência.','A junção aparece automaticamente quando os dutos se encontram.','Use sensores nas portas para enxergar recirculação.'],
};

