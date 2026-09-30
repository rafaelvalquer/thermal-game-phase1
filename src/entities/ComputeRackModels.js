const model=(id,label,specialization,capacity,cost,idlePowerW,maxPowerW,mass,heatCapacity=520)=>({
  id,label,specialization,capacity,cost,idlePowerW,maxPowerW,mass,heatCapacity,
  slaTemperature:30,failureTemperature:65,visualId:'serverRack',
});

export const COMPUTE_RACK_MODEL_IDS=Object.freeze(['basic','professional','enterprise']);
export const COMPUTE_RACK_MODEL_LABELS=Object.freeze({basic:'Básico',professional:'Profissional',enterprise:'Enterprise'});

export const COMPUTE_RACK_MODELS=Object.freeze({
  cpu:Object.freeze({
    basic:model('basic','Básico','cpu',{vcpu:64,ramGB:256,frequencyGHz:3},12000,1000,5000,450),
    professional:model('professional','Profissional','cpu',{vcpu:128,ramGB:512,frequencyGHz:3},24000,2000,10000,520),
    enterprise:model('enterprise','Enterprise','cpu',{vcpu:256,ramGB:1024,frequencyGHz:3},48000,3600,18000,650),
  }),
  gpu:Object.freeze({
    basic:model('basic','Básico','gpu',{gpuCount:2,vramPerGpuGB:24,vramGB:48},30000,1600,8000,550),
    professional:model('professional','Profissional','gpu',{gpuCount:4,vramPerGpuGB:48,vramGB:192},85000,3600,18000,700),
    enterprise:model('enterprise','Enterprise','gpu',{gpuCount:8,vramPerGpuGB:80,vramGB:640},220000,6000,36000,900),
  }),
  storage:Object.freeze({
    basic:model('basic','Básico','storage',{storageTB:50},8000,500,2000,400),
    professional:model('professional','Profissional','storage',{storageTB:200},22000,1000,5000,600),
    enterprise:model('enterprise','Enterprise','storage',{storageTB:500},50000,1600,8000,800),
  }),
});

export function computeRackModel(specialization,modelId='basic'){
  return COMPUTE_RACK_MODELS[specialization]?.[modelId]||null;
}
