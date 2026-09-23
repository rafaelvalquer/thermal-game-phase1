import { level01Map } from '../maps/level01Map.js';

export const level01={
  id:'hot-room',number:1,name:'Hot Room',difficulty:1,
  tagline:'Fundamentos térmicos',
  description:'Três máquinas aquecem uma sala simples. Conduza, mova e rejeite calor sem ultrapassar o limite elétrico.',
  briefing:'Esta é a bancada inicial do Thermal Lab. Observe como o calor se acumula, teste airflow e monte um circuito de água. Você também pode experimentar um HVAC compacto: Air Handler, condensadora externa, dutos e vents de insuflação e retorno.',
  map:level01Map,environment:{outdoorTemperature:25},budget:50000,powerLimit:10000,missionDuration:300,
  inventory:{wall:50,insulation:20,copper:10,fan:4,exhaust:2,pipe:40,pump:1,tank:1,radiator:2,exchanger:3,sensor:5,airHandler:1,condenser:1,smallDuct:20,mediumDuct:12,largeDuct:0,supplyVent:1,returnVent:1,damper:0,demolish:Infinity},
  zones:[{id:'machine-room',name:'Sala de Máquinas',x:9,y:11,width:46,height:35,target:40,visualStyle:'industrial'}],
  entities:[
    {type:'machine',id:'m1',name:'Máquina 1',x:20,y:18,heatOutput:8000,category:'process'},
    {type:'machine',id:'m2',name:'Máquina 2',x:32,y:18,heatOutput:12000,category:'process'},
    {type:'machine',id:'m3',name:'Máquina 3',x:44,y:18,heatOutput:15000,category:'process'},
  ],
  objectives:[
    {type:'machineTemperature',max:40,filter:{heatMachine:true},label:'Todas as máquinas abaixo de 40°C'},
    {type:'powerBelow',max:10000,label:'Cooling abaixo de 10 kW'},
  ],
  failures:[{type:'machineOverheat',temperature:80,hold:30,message:'Uma máquina permaneceu acima de 80°C por tempo demais.'}],
  events:[],
  tips:['Ventiladores movem calor; eles não o apagam.','O radiador funciona melhor com airflow.','O exaustor é a rota direta de energia para o exterior.'],
};

