// Three stars per mission: ★ completed · ★ installed cost within the goal ·
// ★ comfortable operation (thermal margin kept and peak consumption within the goal).
export const TEMPERATURE_OBJECTIVES=new Set(['machineTemperature','zoneTemperature','maxAirTemperature']);

const powerObjective=level=>(level.objectives||[]).find(objective=>objective.type==='powerBelow')?.max;

export function starGoals(level){
  const goals=level.stars||{},power=powerObjective(level)??level.powerLimit??0;
  return {
    cost:goals.cost??Math.round((level.budget||0)*.4/100)*100,
    margin:goals.margin??2,
    maxPower:goals.maxPower??Math.round(power*.8/100)*100,
  };
}

const money=value=>'$'+Math.round(Number(value)||0).toLocaleString('pt-BR');
const kw=value=>((Number(value)||0)/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kW';
const celsius=value=>(Number(value)||0).toLocaleString('pt-BR',{maximumFractionDigits:1})+' °C';

export function starCriteria(level){
  const goals=starGoals(level);
  return [
    {id:'complete',label:'Concluir a missão'},
    {id:'cost',label:'Custo instalado até '+money(goals.cost)},
    {id:'efficiency',label:'Ficar sempre '+celsius(goals.margin)+' abaixo dos limites e com pico até '+kw(goals.maxPower)},
  ];
}

export function rateMission(level,result,won){
  const goals=starGoals(level),margin=result.thermalMargin??-Infinity;
  const checks={
    complete:Boolean(won),
    cost:Boolean(won)&&result.cost<=goals.cost,
    efficiency:Boolean(won)&&margin>=goals.margin&&result.maxPower<=goals.maxPower,
  };
  const details={
    complete:won?'Objetivos estabilizados':'Missão não concluída',
    cost:'Gasto '+money(result.cost)+' / meta '+money(goals.cost),
    efficiency:'Margem mínima '+(Number.isFinite(margin)?celsius(margin):'—')+' / meta '+celsius(goals.margin)+' · pico '+kw(result.maxPower)+' / meta '+kw(goals.maxPower),
  };
  const criteria=starCriteria(level).map(item=>({...item,ok:checks[item.id],detail:details[item.id]}));
  return {stars:criteria.filter(item=>item.ok).length,criteria,goals};
}

export const starString=(count,total=3)=>'★'.repeat(Math.max(0,count))+'☆'.repeat(Math.max(0,total-count));
