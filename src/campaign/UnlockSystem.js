export class UnlockSystem {
  canPlay(level,state){return level.number<=(state.unlockedLevel||1);}
  onComplete(level,state,totalLevels){
    const completed=new Set(state.completedLevels||[]);completed.add(level.id);state.completedLevels=[...completed];
    state.unlockedLevel=Math.max(state.unlockedLevel||1,Math.min(totalLevels,level.number+1));
    return state;
  }
}
