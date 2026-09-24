import { level05Map } from '../maps/level05Map.js';

export const level05={
  id:'thermal-factory',number:5,name:'Thermal Factory',difficulty:5,
  tagline:'Sistemas industriais',
  description:'Forno, motores e processo produtivo exigem isolamento, airflow e refrigeração bem distribuída.',
  briefing:'Nem tudo precisa estar frio. Isole o forno e use unidades independentes para proteger motores, processo, corredores e operadores sem recircular o calor da condensadora.',
  thermalSystems:{simpleCooling:true,waterCooling:true,coolingUnitModel:'commercial'},
  map:level05Map,environment:{outdoorTemperature:27},budget:60000,powerLimit:18000,missionDuration:420,
  inventory:{pipe:120,pump:3,tank:2,radiator:4,exchanger:6,wall:50,insulation:70,copper:30,fan:10,exhaust:5,sensor:14,coolingUnit:3,duct:300,supplyVent:6,demolish:Infinity},
  zones:[
    {id:'furnace-zone',name:'Zona do Forno',x:7,y:8,width:20,height:20,target:900,visualStyle:'industrial'},
    {id:'service-corridor',name:'Corredor de Serviço',x:4,y:29,width:80,height:10,target:45,visualStyle:'corridor'},
    {id:'operators',name:'Sala de Operadores',x:9,y:41,width:19,height:11,target:30,visualStyle:'office'},
    {id:'cooling-room',name:'Sala de Refrigeração',x:57,y:39,width:20,height:13,target:45,visualStyle:'utility'},
  ],
  entities:[
    {type:'furnace',id:'furnace-a',name:'Forno A',x:16,y:17,heatOutput:50000,temperature:800,zoneId:'furnace-zone'},
    {type:'machine',id:'motor-a',name:'Motor A',x:38,y:18,heatOutput:8000,category:'motor',failureTemperature:90},
    {type:'machine',id:'motor-b',name:'Motor B',x:50,y:18,heatOutput:12000,category:'motor',failureTemperature:90},
    {type:'machine',id:'process-a',name:'Prensa Térmica',x:65,y:20,heatOutput:20000,category:'process',failureTemperature:80},
    {type:'passiveHeat',id:'operators-load',name:'Ocupação da sala',x:18,y:46,heatOutput:800,zoneId:'operators',category:'occupancy'},
  ],
  objectives:[
    {type:'machineTemperature',max:75,filter:{category:'motor'},label:'Motores < 75°C'},
    {type:'machineTemperature',max:60,filter:{category:'process'},label:'Processo < 60°C'},
    {type:'zoneTemperature',zoneId:'operators',max:30,label:'Operadores < 30°C'},
    {type:'zoneTemperature',zoneId:'service-corridor',max:45,label:'Corredor < 45°C'},
    {type:'powerBelow',max:15000,label:'Consumo de refrigeração < 15 kW'},
  ],
  failures:[{type:'entityLimits',hold:30},{type:'coolingUnitOverload',hold:60,message:'Uma unidade permaneceu sobrecarregada. Reforce a capacidade ou reduza a carga térmica.'}],
  events:[],
  tips:['Isole o forno em vez de tentar resfriá-lo.','Dutos longos reduzem a eficiência: aproxime as unidades das áreas atendidas.','Instale as condensadoras fora das zonas internas.','Mantenha redes independentes para distribuir o frio entre oficinas.'],
};

