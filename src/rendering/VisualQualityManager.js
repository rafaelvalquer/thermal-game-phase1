const LEVELS={HIGH:{quality:'high',maxRegions:24},MEDIUM:{quality:'medium',maxRegions:16},LOW:{quality:'low',maxRegions:8},OFF:{quality:'low',maxRegions:0}};
const ORDER=['OFF','LOW','MEDIUM','HIGH'];

export class VisualQualityManager {
  constructor({level='HIGH'}={}){this.level=level;}
  update(fps){
    if(!Number.isFinite(fps)||fps<=0)return this.settings();
    if(fps<35)this.level='OFF';
    else if(this.level==='OFF'&&fps>42)this.level='LOW';
    else if(this.level==='LOW'&&fps>48)this.level='MEDIUM';
    else if(this.level==='MEDIUM'&&fps>58)this.level='HIGH';
    else if(this.level==='HIGH'&&fps<50)this.level=fps<40?'LOW':'MEDIUM';
    else if(this.level==='MEDIUM'&&fps<40)this.level='LOW';
    return this.settings();
  }
  settings(){return {...LEVELS[this.level],level:this.level};}
}
