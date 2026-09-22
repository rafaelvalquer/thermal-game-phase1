import { level02Map } from '../maps/level02Map.js';

export const level02={
  id:'ventilation-corridor',number:2,name:'Ventilation Corridor',difficulty:2,
  tagline:'Airflow e corredores',
  description:'Duas salas industriais dependem de um corredor central para levar ar quente até a exaustão.',
  briefing:'A geometria agora importa. Crie uma rota de ar coerente entre as salas e o corredor. Água não está disponível nesta operação.',
  map:level02Map,environment:{outdoorTemperature:25},budget:6000,powerLimit:6000,missionDuration:240,
  inventory:{wall:20,insulation:30,copper:0,fan:6,exhaust:2,pipe:0,pump:0,tank:0,radiator:0,exchanger:0,sensor:6,demolish:Infinity},
  zones:[
    {id:'room-a',name:'Sala A',x:9,y:10,width:15,height:14,target:38},
    {id:'room-b',name:'Sala B',x:36,y:10,width:15,height:14,target:38},
    {id:'main-corridor',name:'Corredor Principal',x:5,y:25,width:54,height:9,target:42},
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
  tips:['Crie uma direção dominante para o ar.','Evite ventiladores soprando um contra o outro.','Use sensores nas portas para enxergar recirculação.'],
};

