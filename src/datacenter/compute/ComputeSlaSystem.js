import { isPowered } from '../../simulation/PowerState.js';
import { diagnoseComputeContract } from './ComputeDiagnostics.js';

export class ComputeSlaSystem {
  constructor(world){this.world=world;}
  refreshDiagnostics(contracts){for(const contract of contracts)if(contract.modality==='compute')contract.computeDiagnostics=diagnoseComputeContract(this.world,contract);}
  afterThermalStep(contracts,calendarDt,physicalDt=calendarDt){
    for(const contract of contracts){
      if(contract.modality!=='compute'||contract.status!=='active')continue;
      contract.computeDiagnostics=diagnoseComputeContract(this.world,contract);
      const allocations=contract.allocations||[],racks=allocations.map(item=>this.world.entitiesByType('computeRack').find(rack=>rack.assetId===item.assetId));
      const provisioned=contract.computeDiagnostics.length===0;
      const powered=provisioned&&allocations.length>0&&racks.every(rack=>rack&&rack.enabled&&isPowered(rack));
      const hot=racks.some(rack=>rack&&(rack.intakeAirTemperature??rack.inletTemperature??25)>contract.maxInletTemperature);
      contract.computeThermalViolationSeconds=hot?(contract.computeThermalViolationSeconds||0)+physicalDt:0;
      const available=powered&&contract.computeThermalViolationSeconds<=60;
      contract.activeSeconds=(contract.activeSeconds||0)+calendarDt;contract.dailyActiveSeconds=(contract.dailyActiveSeconds||0)+calendarDt;
      if(available){contract.uptimeSeconds=(contract.uptimeSeconds||0)+calendarDt;contract.dailyUptimeSeconds=(contract.dailyUptimeSeconds||0)+calendarDt;}
      else {contract.downtimeSeconds=(contract.downtimeSeconds||0)+calendarDt;contract.dailyDowntimeSeconds=(contract.dailyDowntimeSeconds||0)+calendarDt;if(!powered||contract.computeThermalViolationSeconds>60)contract.dailyViolation=true;}
    }
  }
  evaluateDailyAvailability(contracts){
    for(const contract of contracts){if(contract.modality!=='compute'||contract.status!=='active'||contract.dailyActiveSeconds<=0)continue;
      if(100*contract.dailyUptimeSeconds/contract.dailyActiveSeconds<Number(contract.availability||0))contract.dailyViolation=true;
    }
  }
}
