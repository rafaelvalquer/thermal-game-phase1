import { level01 } from './levels/level01.js';

export const engineeringSandbox={
  ...level01,id:'engineering-sandbox',number:0,name:'Engineering Sandbox',difficulty:1,campaign:false,
  tagline:'Modo Engenharia · climatização e circuitos hidráulicos',
  description:'Bancada livre para climatização e circuitos hidráulicos completos.',
  briefing:'Experimente unidades de climatização, dutos, saídas de ar, ventilação e refrigeração por água.',
  thermalSystems:{simpleCooling:true,waterCooling:true,coolingUnitModel:'commercial'},
  budget:1000000,powerLimit:1000000,missionDuration:300,
  inventory:{wall:Infinity,insulation:Infinity,copper:Infinity,fan:Infinity,exhaust:Infinity,pipe:Infinity,pump:Infinity,tank:Infinity,radiator:Infinity,exchanger:Infinity,sensor:Infinity,coolingUnit:Infinity,duct:Infinity,supplyVent:Infinity,demolish:Infinity},
  objectives:[{type:'survive',label:'Experimente sem limites'}],failures:[],events:[],
};
