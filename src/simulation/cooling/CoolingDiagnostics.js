export class CoolingDiagnostics {
  update(networks,units){return {networks:networks.length,ready:networks.filter(n=>n.status==='READY').length,units:units.length,active:units.filter(u=>u.currentCooling>0).length,invalid:networks.filter(n=>n.status!=='READY').map(n=>({id:n.id,status:n.status}))};}
}
