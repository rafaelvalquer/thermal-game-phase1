export class HVACDiagnostics {
  update(networks,handlers,condensers,zonePressures=new Map(),refrigerantCircuits=[]){
    return {
      networks:networks.map(network=>({id:network.id,role:network.role,status:network.status,flowRate:network.flowRate,pressure:network.pressure,junctions:network.junctions.length,deadEnds:network.deadEnds.length})),
      refrigerantCircuits:refrigerantCircuits.map(circuit=>({id:circuit.id,status:circuit.status,length:circuit.length,capacityFactor:circuit.capacityFactor,capacity:circuit.capacity,handlerIds:circuit.handlers.map(item=>item.id),condenserIds:circuit.condensers.map(item=>item.id)})),
      airHandlers:handlers.map(handler=>({id:handler.id,status:handler.status,flowRate:handler.currentFlow,supplyFlow:handler.supplyFlow,returnFlow:handler.returnFlow,supplyAvailableFlow:handler.supplyAvailableFlow,returnAvailableFlow:handler.returnAvailableFlow,returnTemperature:handler.returnTemperature,supplyTemperature:handler.supplyTemperature,coolingDemand:handler.coolingDemand,coolingPower:handler.coolingPower,roomCooling:handler.actualRoomCooling,fanPower:handler.power,compressorPower:handler.compressorPower,cop:handler.cop,refrigerantCircuitId:handler.refrigerantCircuitId})),
      condensers:condensers.map(condenser=>({id:condenser.id,status:condenser.status,coolingLoad:condenser.coolingLoad,heatRejected:condenser.heatRejected,electricalPower:condenser.electricalPower,indoor:condenser.indoor,refrigerantCircuitId:condenser.refrigerantCircuitId})),
      zonePressures:[...zonePressures].map(([zoneId,pressure])=>({zoneId,pressure})),
    };
  }
}
