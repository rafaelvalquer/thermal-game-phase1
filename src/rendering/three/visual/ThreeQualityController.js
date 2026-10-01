const LEVELS=['low','medium','high','ultra'];

export class ThreeQualityController {
  constructor(quality='medium'){this.quality=LEVELS.includes(quality)?quality:'medium';this.slowIntervals=0;this.fastIntervals=0;}
  sample(fps){
    if(fps<40){this.slowIntervals++;this.fastIntervals=0;if(this.slowIntervals<2)return null;this.slowIntervals=0;return this.step(-1);}
    if(fps>56){this.fastIntervals++;this.slowIntervals=0;if(this.fastIntervals<2)return null;this.fastIntervals=0;return this.step(1);}
    this.slowIntervals=0;this.fastIntervals=0;return null;
  }
  set(quality){if(!LEVELS.includes(quality))return false;this.quality=quality;this.slowIntervals=0;this.fastIntervals=0;return true;}
  step(direction){const index=LEVELS.indexOf(this.quality),next=LEVELS[Math.max(0,Math.min(LEVELS.length-1,index+direction))];if(next===this.quality)return null;this.quality=next;return next;}
}
