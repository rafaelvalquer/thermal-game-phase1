import { level04Map } from '../maps/level04Map.js';

const racks=[
  [12,18,'rack-a1'],[20,18,'rack-a2'],[38,18,'rack-b1'],[46,18,'rack-b2'],
  [12,40,'rack-c1'],[20,40,'rack-c2'],[38,40,'rack-d1'],[46,40,'rack-d2'],
];

export const level04={
  id:'server-vault',number:4,name:'Server Vault',difficulty:4,
  tagline:'Hot aisle / cold aisle',
  description:'Racks direcionais transformam o data center em um problema de hotspots, recirculação e capacidade de refrigeração.',
  briefing:'Os racks aspiram ar pelo lado indicado e descarregam calor no lado oposto. Organize corredores frios e quentes com duas ou três unidades independentes e reserve capacidade para o pico de carga.',
  thermalSystems:{simpleCooling:true,waterCooling:true,coolingUnitModel:'commercial'},
  map:level04Map,environment:{outdoorTemperature:24},budget:60000,powerLimit:16000,missionDuration:360,
  inventory:{pipe:80,pump:2,tank:2,radiator:3,exchanger:4,wall:35,insulation:45,copper:20,fan:10,exhaust:4,sensor:12,coolingUnit:3,duct:300,supplyVent:6,demolish:Infinity},
  zones:[
    {id:'cold-a',name:'Cold Aisle A',x:7,y:9,width:20,height:8,target:30,visualStyle:'server'},
    {id:'cold-b',name:'Cold Aisle B',x:33,y:9,width:20,height:8,target:30,visualStyle:'server'},
    {id:'hot-center',name:'Hot Aisle',x:5,y:25,width:50,height:10,target:50,visualStyle:'industrial'},
    {id:'service-room',name:'Service Room',x:59,y:40,width:13,height:11,target:42,visualStyle:'utility'},
  ],
  entities:racks.map(([x,y,id],i)=>({
    type:'serverRack',id,name:'Rack '+String(i+1).padStart(2,'0'),x,y,heatOutput:6500+(i%3)*1000,category:'serverRack',
    airIntakeDirection:{x:0,y:i<4?-1:1},airExhaustDirection:{x:0,y:i<4?1:-1},failureTemperature:55
  })),
  objectives:[
    {type:'machineTemperature',max:45,filter:{category:'serverRack'},label:'Todos os racks < 45°C'},
    {type:'zoneTemperature',zoneId:'cold-a',max:30,label:'Cold Aisle A < 30°C'},
    {type:'zoneTemperature',zoneId:'cold-b',max:30,label:'Cold Aisle B < 30°C'},
    {type:'maxAirTemperature',max:50,label:'Nenhum hotspot de ar > 50°C'},
    {type:'powerBelow',max:12000,label:'Consumo de refrigeração < 12 kW'},
  ],
  failures:[{type:'entityLimits',hold:30,message:'Um rack ultrapassou sua temperatura crítica.'},{type:'coolingUnitOverload',hold:60,message:'Uma condensadora permaneceu sobrecarregada. Adicione capacidade ou reduza a carga.'}],
  events:[
    {time:180,type:'machineLoad',filter:{category:'serverRack'},multiplier:1.3,message:'PEAK LOAD: carga dos racks aumentou para 130%.'},
  ],
  tips:['Direcione a saída fria para o cold aisle e deixe o retorno natural ocorrer pela sala.','Use redes separadas para distribuir refrigeração entre os corredores.','Condensadoras internas devolvem o calor à sala.','Não projete para a carga inicial: haverá pico aos 180 s.'],
};

