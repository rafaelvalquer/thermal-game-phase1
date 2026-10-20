const ICONS={ok:'✓',pending:'◇',waiting:'…'};

export class ObjectivePanel {
  constructor(root){this.root=root;}
  update(sim){
    const mission=sim.mission,level=sim.level,status=mission.objectiveStatus||[];
    if(!status.length){this.root.innerHTML='';return;}
    const duration=level.missionDuration||300,pct=Math.min(100,mission.holdSeconds/duration*100),waiting=mission.waiting;
    const note=mission.state==='planning'?'Aguardando o início da operação':waiting?'Aguardando as máquinas ligarem':'';
    this.root.innerHTML='<div class="objective-head"><span>OBJETIVOS</span><strong>'+mission.holdSeconds.toFixed(0)+' / '+duration+' s</strong></div>'+
      (note?'<div class="objective-note">'+note+'</div>':'')+
      status.map(s=>{const state=s.state||(s.ok?'ok':'pending');return '<div class="objective-row '+state+'"><i>'+ICONS[state]+'</i><span>'+s.label+'</span></div>';}).join('')+
      '<div class="objective-progress"><div style="width:'+pct+'%"></div></div>';
  }
}
