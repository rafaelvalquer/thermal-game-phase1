export class CoolingFramePlan {
  constructor({dt,topologyVersion,powerSignature,units,vents,pendingExchange,momentumSources}){
    this.dt=dt;
    this.topologyVersion=topologyVersion;
    this.powerSignature=powerSignature;
    this.units=units;
    this.vents=vents;
    this.pendingExchange=pendingExchange;
    this.momentumSources=momentumSources;
  }

  matches({dt,topologyVersion,powerSignature}){
    return this.dt===dt&&this.topologyVersion===topologyVersion&&this.powerSignature===powerSignature;
  }
}
