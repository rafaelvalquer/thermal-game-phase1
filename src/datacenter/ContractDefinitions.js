export const CONTRACT_TEMPLATES=Object.freeze([
  {clientName:'NovaBank',tier:'Banco',rackCount:4,powerPerRackKW:12,maxInletTemperature:27,availability:99.5,termDays:180,installationFee:15000,monthlyFee:28000,loadProfile:'banking'},
  {clientName:'PixelGames',tier:'Streaming',rackCount:8,powerPerRackKW:8,maxInletTemperature:30,availability:99,termDays:180,installationFee:18000,monthlyFee:31000,loadProfile:'streaming'},
  {clientName:'AIForge',tier:'Inteligência artificial',rackCount:3,powerPerRackKW:40,maxInletTemperature:32,availability:98.5,termDays:180,installationFee:30000,monthlyFee:55000,loadProfile:'ai'},
  {clientName:'CloudNorth',tier:'SaaS',rackCount:6,powerPerRackKW:10,maxInletTemperature:29,availability:99.5,termDays:180,installationFee:22000,monthlyFee:42000,loadProfile:'streaming'},
  {clientName:'MedData',tier:'Saúde',rackCount:5,powerPerRackKW:14,maxInletTemperature:26,availability:99.9,termDays:180,installationFee:26000,monthlyFee:49000,loadProfile:'banking'},
  {clientName:'RenderForge',tier:'GPU',rackCount:4,powerPerRackKW:32,maxInletTemperature:30,availability:99,termDays:180,installationFee:28000,monthlyFee:52000,loadProfile:'ai'},
]);

export function createContractOffer(template,index){return {...template,id:'offer-'+index,contractId:'contract-'+index};}
