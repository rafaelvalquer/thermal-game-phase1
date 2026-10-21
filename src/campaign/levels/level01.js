import { level01Map } from '../maps/level01Map.js';

export const level01={
  id:'hot-room',number:1,name:'Hot Room',difficulty:1,
  tagline:'Fundamentos térmicos',
  description:'Três máquinas aquecem uma sala simples. Conduza, mova e rejeite calor sem ultrapassar o limite elétrico.',
  briefing:'Esta é a bancada inicial do Thermal Lab. Instale uma condensadora fora da sala, ligue-a com dutos e direcione a saída de ar gelado para as máquinas. Observe como posição e airflow mudam o resfriamento.',
  // The compact unit fits the 10 kW limit; the commercial one (M) cools more but exceeds it on its own.
  thermalSystems:{simpleCooling:true,waterCooling:true,coolingUnitModel:'compact'},
  uiLevel:1,
  // Star goals: the tutorial build earns 1 star; 3 stars need the lean airflow-only build.
  stars:{cost:2000,margin:2,maxPower:4000},
  map:level01Map,environment:{outdoorTemperature:25},budget:50000,powerLimit:10000,missionDuration:300,
  inventory:{pipe:24,pump:1,tank:1,radiator:1,exchanger:1,waterChiller:1,wall:50,insulation:20,copper:10,fan:4,exhaust:2,sensor:5,coolingUnit:1,duct:120,supplyVent:1,demolish:Infinity},
  zones:[{id:'machine-room',name:'Sala de Máquinas',x:9,y:11,width:46,height:35,target:40,visualStyle:'industrial'}],
  entities:[
    {type:'machine',id:'m1',name:'Máquina 1',x:20,y:18,heatOutput:8000,category:'process'},
    {type:'machine',id:'m2',name:'Máquina 2',x:32,y:18,heatOutput:12000,category:'process'},
    {type:'machine',id:'m3',name:'Máquina 3',x:44,y:18,heatOutput:15000,category:'process'},
  ],
  objectives:[
    {type:'machineTemperature',max:40,filter:{heatMachine:true},label:'Todas as máquinas abaixo de 40°C'},
    {type:'powerBelow',max:10000,label:'Consumo de refrigeração abaixo de 10 kW'},
  ],
  failures:[{type:'machineOverheat',temperature:80,hold:30,message:'Uma máquina permaneceu acima de 80°C por tempo demais.'}],
  events:[],
  tips:['Coloque a condensadora fora das zonas internas para rejeitar calor no exterior.','Arraste para ligar a unidade à saída de ar gelado.','A seta da saída determina para onde o jato frio entra na sala.','Ventiladores movem calor; eles não o apagam.'],
  tutorial:{
    steps:[
      {id:'select-unit',title:'Escolha a condensadora',text:'Em CONSTRUÇÃO, abra CLIMATIZAÇÃO e selecione a Condensadora. O modelo Compacto consome pouco e cabe no limite de 10 kW.',openTool:'coolingUnit',highlight:['[data-tool="coolingUnit"]'],check:'toolSelected',tool:'coolingUnit'},
      {id:'place-unit',title:'Instale do lado de fora',text:'Clique na área marcada, fora das paredes. A condensadora despeja no lugar onde está o calor que retira da sala.',area:{x:1,y:15,width:6,height:7,label:'INSTALE AQUI'},check:'outdoorCoolingUnit',
        warning:{check:'indoorCoolingUnit',text:'Uma condensadora dentro da sala devolve o calor para o mesmo ambiente. Remova-a com Demolir e instale do lado de fora.'}},
      {id:'duct',title:'Leve o frio com dutos',text:'Selecione Duto e arraste a partir da condensadora até dentro da sala. Dutos atravessam paredes.',openTool:'duct',highlight:['[data-tool="duct"]'],area:{x:5,y:16,width:10,height:5,label:'ARRASTE O DUTO ATÉ AQUI'},check:'ductIntoRoom'},
      {id:'vent',title:'Aponte a saída de ar gelado',text:'Selecione Saída de ar e clique colado à ponta do duto. Use R até a seta apontar para as máquinas (→): a faixa azul mostra até onde o jato frio chega.',openTool:'supplyVent',highlight:['[data-tool="supplyVent"]'],check:'ventAimed',
        warning:{check:'ventMisaimed',text:'A saída está apontando para longe das máquinas. Remova-a, gire com R e instale de novo.'}},
      {id:'fans',title:'Espalhe o frio com ventiladores',text:'Uma saída sozinha não alcança as três máquinas. Instale 3 Ventiladores logo à esquerda de cada máquina, apontando para ela (→). A prévia mostra qual máquina cada jato atinge.',openTool:'fan',highlight:['[data-tool="fan"]'],area:{x:17,y:17,width:28,height:3,label:'VENTILADORES ANTES DE CADA MÁQUINA'},check:'entityCount',entity:'fan',count:3},
      {id:'exhausts',title:'Jogue o ar quente para fora',text:'Ventiladores só movem o calor. Instale 2 Exaustores colados à abertura da parede leste, apontando para fora (→): eles despejam o ar quente no exterior.',openTool:'exhaust',highlight:['[data-tool="exhaust"]'],area:{x:52,y:16,width:3,height:5,label:'EXAUSTORES'},check:'entityCount',entity:'exhaust',count:2},
      {id:'start',title:'Inicie e observe o calor',text:'Clique em Iniciar operação (ou Enter) e ative o modo Térmico para ver as máquinas aquecendo e o ar frio chegando.',highlight:[{selector:'#startOperationBtn',phase:'planning'},{selector:'[data-mode="thermal"]',phase:'running'}],check:'operationThermal'},
    ],
    complete:{title:'Sala sob controle',text:'Mantenha as três máquinas abaixo de 40 °C por 5 minutos. Se uma máquina esquentar demais, aproxime o ventilador dela ou instale o quarto.'},
  },
};
