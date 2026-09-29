export class PowerFrameSnapshot {
  constructor(){this.valid=false;this.clear();}

  clear(){
    Object.assign(this,{rackPowerW:0,coolingPowerW:0,fluidPowerW:0,auxiliaryPowerW:0,grossLoadW:0,operatingLoadW:0,
      solarGenerationW:0,batteryChargeW:0,batteryDischargeW:0,gridChargeW:0,solarChargeW:0,gridPowerW:0,capacityW:0,reserveW:0,overloaded:false});
    return this;
  }

  capture({requestedLoads,operatingLoads,solarGenerationW=0,batteryChargeW=0,batteryDischargeW=0,gridChargeW=0,solarChargeW=0,gridPowerW=0,capacityW=0,generation=0}){
    this.rackPowerW=requestedLoads.rack;this.coolingPowerW=requestedLoads.cooling;this.fluidPowerW=requestedLoads.fluid;this.auxiliaryPowerW=requestedLoads.auxiliary;
    this.grossLoadW=this.rackPowerW+this.coolingPowerW+this.fluidPowerW+this.auxiliaryPowerW;
    this.operatingLoadW=operatingLoads.rack+operatingLoads.cooling+operatingLoads.fluid+operatingLoads.auxiliary;
    Object.assign(this,{solarGenerationW,batteryChargeW,batteryDischargeW,gridChargeW,solarChargeW,gridPowerW,capacityW,generation});
    this.reserveW=Number.isFinite(capacityW)?capacityW-gridPowerW:Infinity;this.overloaded=gridPowerW>capacityW;this.valid=true;return this;
  }
}
