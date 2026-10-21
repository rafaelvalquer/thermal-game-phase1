import { isPowered } from '../simulation/PowerState.js';

// Rule-based debrief hints read from the final mission state. Each rule returns
// a hint or nothing; the highest-priority hints are shown to the player.
const inZone=(zones,x,y)=>(zones||[]).some(z=>x>=z.x&&y>=z.y&&x<z.x+z.width&&y<z.y+z.height);
const airSpeedAround=(world,entity)=>{
  if(!world.airX||!world.airY)return null;
  let best=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const x=entity.x+dx,y=entity.y+dy;if(!world.inBounds(x,y))continue;
    const i=world.index(x,y);best=Math.max(best,Math.hypot(world.airX[i]||0,world.airY[i]||0));
  }
  return best;
};

const RULES=[
  ({sim,level})=>{
    const objective=(level.objectives||[]).find(item=>item.type==='powerBelow'),peak=sim.metrics.maxPowerEver||0;
    if(!objective||peak<=objective.max)return null;
    const units=sim.world.entitiesByType('coolingUnit').filter(unit=>unit.tier!=='compact');
    return {priority:90,title:'Consumo acima da meta',text:'O pico chegou a '+(peak/1000).toFixed(1)+' kW para uma meta de '+(objective.max/1000).toFixed(1)+' kW.'+(units.length?' Condensadoras maiores sempre trabalham no máximo: troque pelo modelo Compacto (tecla M) e complete com ventiladores e exaustores.':' Remova equipamentos que não estão ajudando ou use exaustores no lugar de condensadoras.')};
  },
  ({sim,level})=>{
    const indoor=sim.world.entitiesByType('coolingUnit').find(unit=>inZone(level.zones,unit.x,unit.y));
    return indoor?{priority:85,title:'Condensadora dentro da sala',text:'Uma condensadora instalada dentro de uma zona devolve o calor ao próprio ambiente. Instale-a do lado de fora.',x:indoor.x,y:indoor.y}:null;
  },
  ({sim})=>{
    const units=sim.world.entitiesByType('coolingUnit'),cooling=sim.cooling;
    const disconnected=units.find(unit=>isPowered(unit)&&!(cooling?.networksByUnitId?.get(unit.id)||[]).some(network=>network.status==='READY'));
    return disconnected?{priority:80,title:'Condensadora sem saída de ar',text:'Uma condensadora não está ligada por dutos a uma saída de ar gelado: ela consome energia sem resfriar nada.',x:disconnected.x,y:disconnected.y}:null;
  },
  ({sim})=>{
    const overloaded=sim.world.entitiesByType('coolingUnit').find(unit=>unit.status==='OVERLOAD');
    return overloaded?{priority:60,title:'Refrigeração no limite',text:'Uma condensadora trabalhou sobrecarregada. Divida a carga com outra unidade ou retire calor com exaustores.',x:overloaded.x,y:overloaded.y}:null;
  },
  ({sim})=>{
    const world=sim.world;
    if(world.entitiesByType('exhaust').length||world.entitiesByType('coolingUnit').length||world.entitiesByType('radiator').length)return null;
    return {priority:75,title:'O calor não tem para onde ir',text:'Sem exaustores, condensadoras ou radiadores, o calor fica preso dentro da instalação: ventiladores só o movem de lugar. Use exaustores nas aberturas externas ou uma condensadora instalada do lado de fora.'};
  },
  ({sim,failure})=>{
    const entity=failure?.entityId!=null?sim.world.getEntityById(failure.entityId):null;
    if(!entity||!entity.isHeatMachine)return null;
    const speed=airSpeedAround(sim.world,entity);
    if(speed==null||speed>=.25)return null;
    return {priority:70,title:'Pouco ar em '+(entity.name||'equipamento'),text:'Quase não havia fluxo de ar ao redor do equipamento que falhou. Aponte um ventilador ou uma saída de ar gelado diretamente para ele.',x:entity.x,y:entity.y};
  },
  ({level,failure})=>{
    if(!failure?.zoneId)return null;
    return {priority:65,title:(failure.zoneName||'Zona')+' superaquecida',text:'O ar quente ficou preso nesta zona. Leve uma saída de ar gelado até ela ou crie um caminho até um exaustor.',x:failure.x,y:failure.y};
  },
  ({sim})=>{
    const networks=sim.fluid?.networks||[];
    const noRadiator=networks.find(network=>network.closed&&network.entities.some(e=>e.type==='exchanger')&&!network.entities.some(e=>e.type==='radiator'));
    return noRadiator?{priority:55,title:'Água sem rejeição de calor',text:'Um circuito de água capta calor mas não tem radiador para dissipá-lo.'}:null;
  },
];

export function diagnoseMission({sim,level},{limit=2}={}){
  const context={sim,level,failure:sim.mission.failure};
  return RULES.map(rule=>{try{return rule(context);}catch{return null;}}).filter(Boolean).sort((a,b)=>b.priority-a.priority).slice(0,limit);
}
