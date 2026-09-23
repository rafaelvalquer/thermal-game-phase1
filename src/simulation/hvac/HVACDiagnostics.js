export class HVACDiagnostics {
  update(networks,handlers,condensers,zonePressures=new Map()){
    return {
      networks:networks.map(network=>({id:network.id,role:network.role,status:network.status,flowRate:network.flowRate,pressure:network.pressure,junctions:network.junctions.length,deadEnds:network.deadEnds.length})),
      airHandlers:handlers.map(handler=>({id:handler.id,status:handler.status,flowRate:handler.currentFlow,supplyFlow:handler.supplyFlow,returnFlow:handler.returnFlow,supplyAvailableFlow:handler.supplyAvailableFlow,returnAvailableFlow:handler.returnAvailableFlow,returnTemperature:handler.returnTemperature,supplyTemperature:handler.supplyTemperature,coolingDemand:handler.coolingDemand,coolingPower:handler.coolingPower})),
      condensers:condensers.map(condenser=>({id:condenser.id,status:condenser.status,heatRejected:condenser.heatRejected,electricalPower:condenser.electricalPower,indoor:condenser.indoor})),
      zonePressures:[...zonePressures].map(([zoneId,pressure])=>({zoneId,pressure})),
    };
  }
}
