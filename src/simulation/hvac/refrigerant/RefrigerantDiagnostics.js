export class RefrigerantDiagnostics {
  update(circuits){return circuits.map(circuit=>({id:circuit.id,status:circuit.status,handlerIds:circuit.handlers.map(item=>item.id),condenserIds:circuit.condensers.map(item=>item.id),length:circuit.length,capacityFactor:circuit.capacityFactor,capacity:circuit.capacity,branches:circuit.branchCount}));}
}
