export const GAME_DAY_SECONDS=24*60*60;

export class GameClock {
  constructor(seconds=0){this.seconds=Math.max(0,Number(seconds)||0);}
  advance(dt){if(Number.isFinite(dt)&&dt>0)this.seconds+=dt;}
  get day(){return Math.floor(this.seconds/GAME_DAY_SECONDS)+1;}
  get daySeconds(){return this.seconds%GAME_DAY_SECONDS;}
  get hour(){return this.daySeconds/3600;}
  format(){
    const h=Math.floor(this.daySeconds/3600),m=Math.floor((this.daySeconds%3600)/60);
    return 'Ano '+(Math.floor((this.day-1)/360)+1)+' · Mês '+(Math.floor(((this.day-1)%360)/30)+1)+' · Dia '+(((this.day-1)%30)+1)+' · '+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  }
}
