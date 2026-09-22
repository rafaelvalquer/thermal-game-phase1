export class ObjectivePanel {
  constructor(root){this.root=root;}
  update(sim){
    const mission=sim.mission,level=sim.level,status=mission.objectiveStatus||[];
    if(!status.length){this.root.innerHTML='';return;}
    const duration=level.missionDuration||300,pct=Math.min(100,mission.holdSeconds/duration*100);
    this.root.innerHTML='<div class="objective-head"><span>OBJETIVOS</span><strong>'+mission.holdSeconds.toFixed(0)+' / '+duration+' s</strong></div>'+
      status.map(s=>'<div class="objective-row '+(s.ok?'ok':'pending')+'"><i>'+(s.ok?'✓':'◇')+'</i><span>'+s.label+'</span></div>').join('')+
      '<div class="objective-progress"><div style="width:'+pct+'%"></div></div>';
  }
}
