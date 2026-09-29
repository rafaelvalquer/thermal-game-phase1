const DEFAULT_INTERVALS={inspector:.1,clock:.1,metrics:.2,alerts:.2,staff:1/3,datacenterDashboard:1/3,graphs:.5,objectives:.2,minimap:.2};

export class UIScheduler {
  constructor(intervals=DEFAULT_INTERVALS){this.intervals=intervals;this.accumulated=Object.fromEntries(Object.keys(intervals).map(key=>[key,0]));this.pending=new Set();}
  update(dt){
    const due=[...this.pending];this.pending.clear();
    for(const [key,interval] of Object.entries(this.intervals)){
      this.accumulated[key]+=Math.max(0,dt||0);
      if(this.accumulated[key]+1e-9<interval)continue;
      this.accumulated[key]%=interval;due.push(key);
    }
    return due;
  }
  flush(key){if(!(key in this.accumulated))return false;this.accumulated[key]=0;this.pending.add(key);return true;}
}
