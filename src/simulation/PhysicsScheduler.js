export class PhysicsScheduler {
  constructor({physicsQuantum=.05,maxPhysicsSubstepsPerFrame=4,maxBacklogSeconds=2}={}){
    this.physicsQuantum=physicsQuantum;this.maxPhysicsSubstepsPerFrame=maxPhysicsSubstepsPerFrame;this.maxBacklogSeconds=maxBacklogSeconds;
    this.backlogSeconds=0;this.droppedSeconds=0;this.lastSubsteps=0;this.lastStepSeconds=0;this.maxSubstepsObserved=0;
  }

  advance(frameSeconds,speed,{untilBoundary=()=>Infinity,onStep,canAdvance=()=>true}={}){
    if(!canAdvance()){this.lastSubsteps=0;this.lastStepSeconds=0;return 0;}
    const requested=Math.max(0,frameSeconds*speed);
    // Keep even explicit updates inside the same bounded backlog budget.
    const accepted=Math.min(requested,Math.max(0,this.maxBacklogSeconds-this.backlogSeconds));
    this.droppedSeconds+=requested-accepted;this.backlogSeconds+=accepted;
    let consumed=0,steps=0;
    if(!this.backlogSeconds||!canAdvance()){this.lastSubsteps=0;this.lastStepSeconds=0;return 0;}
    const frameBudget=this.physicsQuantum*this.maxPhysicsSubstepsPerFrame,overBudget=this.backlogSeconds>frameBudget+1e-9;
    // Keep the physical step size invariant through 8x so faster simulation
    // changes elapsed time without changing the integration resolution. At
    // 24x, a 0.1 s quantum lets four steps cover an ordinary rendered frame.
    const quantum=overBudget?this.physicsQuantum*2:this.physicsQuantum;
    while(this.backlogSeconds>1e-9&&steps<this.maxPhysicsSubstepsPerFrame&&canAdvance()){
      const boundary=Math.max(0,untilBoundary());
      const reachesBoundary=boundary<=quantum+1e-9&&this.backlogSeconds+1e-9>=boundary;
      if(!reachesBoundary&&this.backlogSeconds+1e-9<quantum)break;
      const step=reachesBoundary?boundary:quantum;
      if(step<=1e-9)break;
      onStep(step);this.backlogSeconds-=step;consumed+=step;steps++;
    }
    this.lastSubsteps=steps;this.lastStepSeconds=steps?consumed/steps:0;
    this.maxSubstepsObserved=Math.max(this.maxSubstepsObserved,steps);
    return consumed;
  }
}
