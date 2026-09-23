import { level03Map } from '../maps/level03Map.js';

export const level03={
  id:'office-complex',number:3,name:'Office Complex',difficulty:3,
  tagline:'Distribuição entre salas',
  description:'Escritórios, laboratório e sala elétrica possuem limites térmicos diferentes e compartilham a mesma saída externa.',
  briefing:'Nem todos os ambientes toleram a mesma temperatura. Proteja áreas humanas e concentre refrigeração onde a carga térmica é maior.',
  map:level03Map,environment:{outdoorTemperature:26},budget:9000,powerLimit:9000,missionDuration:300,
  inventory:{wall:28,insulation:35,copper:12,fan:7,exhaust:2,pipe:55,pump:1,tank:1,radiator:1,exchanger:3,sensor:9,demolish:Infinity},
  zones:[
    {id:'office-a',name:'Escritório A',x:8,y:9,width:12,height:13,target:30,visualStyle:'office'},
    {id:'office-b',name:'Escritório B',x:25,y:9,width:10,height:13,target:30,visualStyle:'office'},
    {id:'laboratory',name:'Laboratório',x:40,y:9,width:22,height:17,target:35,visualStyle:'lab'},
    {id:'electrical',name:'Sala Elétrica',x:9,y:36,width:18,height:10,target:45,visualStyle:'utility'},
    {id:'office-corridor',name:'Corredor Central',x:4,y:27,width:64,height:7,target:38,visualStyle:'corridor'},
  ],
  entities:[
    {type:'machine',id:'lab-m1',name:'Analisador A',x:46,y:15,heatOutput:9000,zoneId:'laboratory',category:'lab'},
    {type:'machine',id:'lab-m2',name:'Analisador B',x:56,y:18,heatOutput:11000,zoneId:'laboratory',category:'lab'},
    {type:'machine',id:'electrical-m1',name:'UPS Principal',x:18,y:40,heatOutput:13000,zoneId:'electrical',category:'electrical'},
    {type:'passiveHeat',id:'person-a1',name:'Ocupação A1',x:11,y:13,heatOutput:150,zoneId:'office-a',category:'occupancy'},
    {type:'passiveHeat',id:'person-a2',name:'Ocupação A2',x:16,y:17,heatOutput:150,zoneId:'office-a',category:'occupancy'},
    {type:'passiveHeat',id:'pc-a',name:'Workstation A',x:17,y:12,heatOutput:300,zoneId:'office-a',category:'computer'},
    {type:'passiveHeat',id:'person-b1',name:'Ocupação B1',x:28,y:13,heatOutput:150,zoneId:'office-b',category:'occupancy'},
    {type:'passiveHeat',id:'person-b2',name:'Ocupação B2',x:32,y:18,heatOutput:150,zoneId:'office-b',category:'occupancy'},
    {type:'passiveHeat',id:'pc-b',name:'Workstation B',x:32,y:12,heatOutput:300,zoneId:'office-b',category:'computer'},
  ],
  objectives:[
    {type:'zoneTemperature',zoneId:'office-a',max:30,label:'Escritório A < 30°C'},
    {type:'zoneTemperature',zoneId:'office-b',max:30,label:'Escritório B < 30°C'},
    {type:'zoneTemperature',zoneId:'laboratory',max:35,label:'Laboratório < 35°C'},
    {type:'zoneTemperature',zoneId:'electrical',max:45,label:'Sala elétrica < 45°C'},
    {type:'powerBelow',max:9000,label:'Potência < 9 kW'},
  ],
  failures:[{type:'machineOverheat',temperature:85,hold:30}],
  events:[],
  tips:['Isolar uma sala pode proteger outra, mas também prender calor.','O único radiador deve ser colocado onde mais agrega valor.','A sala elétrica tolera mais calor que os escritórios.'],
};

