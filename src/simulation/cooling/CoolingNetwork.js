export class CoolingNetwork {
  constructor({id,sourceUnit,sourceUnits=[],ducts=[],vents=[],status='READY',paths=[]}){
    this.id=id;this.sourceUnit=sourceUnit;this.sourceUnitId=sourceUnit?.missionId||String(sourceUnit?.id||'');
    this.sourceUnits=sourceUnits.length?sourceUnits:(sourceUnit?[sourceUnit]:[]);
    this.ducts=ducts;this.vents=vents;this.paths=paths;this.status=status;this.totalLength=0;
    this.effectiveEfficiency=0;this.availableCooling=0;this.availableAirFlow=0;this.coolingDelivered=0;
  }
}
