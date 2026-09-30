import { COMPUTE_PRODUCTS, CLOUD_CLIENT_NAMES } from '../products/ProductDefinitions.js';
import { priceComputeProduct } from '../products/ProductPricing.js';

export class ComputeContractGenerator {
  constructor({random=Math.random}={}){this.random=random;}
  generate({id,day,reputation=0,expiresIn=5,growth=1}={}){
    const eligible=COMPUTE_PRODUCTS.filter(product=>reputation>=product.minimumReputation);
    if(!eligible.length)return null;
    const product=eligible[Math.floor(this.random()*eligible.length)];
    const scale=Math.max(1,Math.min(3,growth));
    const requirements=Object.fromEntries(Object.entries(product.computeRequirements).map(([key,value])=>[key,key==='gpuMinVramGB'?value:Math.max(1,Math.round(value*scale))]));
    const pricing=priceComputeProduct(product,{growth:scale,reputation,termDays:product.termDays});
    const suffix=1+Math.floor(this.random()*9999);
    const clientName=CLOUD_CLIENT_NAMES[Math.floor(this.random()*CLOUD_CLIENT_NAMES.length)]+' '+suffix;
    return {id,contractId:id.replace(/^offer-/,'contract-'),modality:'compute',productId:product.id,productName:product.name,
      clientName,tier:product.name,clientTier:product.clientTier,minimumReputation:product.minimumReputation,
      computeRequirements:requirements,termDays:product.termDays,offeredDay:day,expiresDay:day+expiresIn,isNew:true,locked:false,
      ...pricing,loadProfile:product.profile,
      maxInletTemperature:product.maxInletTemperature,availability:product.availability,
      rackCount:0,powerPerRackKW:0};
  }
}
