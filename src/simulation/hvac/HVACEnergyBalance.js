export class HVACEnergyBalance {
  calculate({roomCooling=0,ductHeatTransfer=0,evaporatorCooling=0,compressorPower=0,airHandlerFanPower=0,condenserFanPower=0,heatRejected=0}={}){
    const expected=evaporatorCooling+compressorPower+condenserFanPower;
    const error=heatRejected-expected;
    return {roomCooling,ductHeatTransfer,evaporatorCooling,compressorPower,airHandlerFanPower,condenserFanPower,heatRejected,error,
      errorPercent:heatRejected>0?Math.abs(error)/heatRejected*100:0};
  }
}
