import { Entity } from './Entity.js';

export class PassiveHeatSource extends Entity {
  constructor(x,y,{name='Fonte térmica',heatOutput=300,icon='heat',startAt=0,category='passive'}={}) {
    super('passiveHeat',x,y);
    this.name=name;this.heatOutput=heatOutput;this.icon=icon;this.startAt=startAt;this.category=category;
    this.isPassiveHeatSource=true;this.started=false;
  }
}
