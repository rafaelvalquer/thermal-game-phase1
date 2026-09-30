export const COMPUTE_PRODUCTS=Object.freeze([
  {id:'cloud-cpu',name:'Cloud CPU',specialization:'cpu',clientTier:'small',minimumReputation:0,
    computeRequirements:{vcpu:24,ramGB:96},monthlyBase:9000,setupBase:1200,termDays:180,profile:'business',maxInletTemperature:32,availability:99.5},
  {id:'cloud-gpu',name:'GPU Cloud',specialization:'gpu',clientTier:'enterprise',minimumReputation:30,
    computeRequirements:{vcpu:32,ramGB:128,gpuCount:2,gpuMinVramGB:24},monthlyBase:24000,setupBase:5000,termDays:180,profile:'ai',maxInletTemperature:30,availability:99.9},
  {id:'cloud-storage',name:'Storage Cloud',specialization:'storage',clientTier:'business',minimumReputation:20,
    computeRequirements:{storageTB:40},monthlyBase:7000,setupBase:1800,termDays:180,profile:'storage',maxInletTemperature:35,availability:99.5},
  {id:'cloud-hybrid',name:'Cloud Híbrida',specialization:'hybrid',clientTier:'premium',minimumReputation:60,
    computeRequirements:{vcpu:48,ramGB:192,gpuCount:2,gpuMinVramGB:48,storageTB:60},monthlyBase:42000,setupBase:9000,termDays:240,profile:'constant',maxInletTemperature:29,availability:99.9},
]);

export const CLOUD_CLIENT_NAMES=Object.freeze(['Nuvem Ágil','StreamForge','DataVita','NeuralWorks','Armazenamento Aurora','PixelCloud','Inova IA','Atlas Compute']);
