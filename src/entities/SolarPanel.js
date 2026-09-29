import { Entity } from './Entity.js';

export const SOLAR_PANEL_PEAK_POWER_W=2000;
export const SOLAR_PANEL_SUNRISE_HOUR=6;
export const SOLAR_PANEL_SUNSET_HOUR=18;

export function solarIrradiance(hour){
  const h=((Number(hour)||0)%24+24)%24;
  if(h<=SOLAR_PANEL_SUNRISE_HOUR||h>=SOLAR_PANEL_SUNSET_HOUR)return 0;
  return Math.sin(Math.PI*(h-SOLAR_PANEL_SUNRISE_HOUR)/(SOLAR_PANEL_SUNSET_HOUR-SOLAR_PANEL_SUNRISE_HOUR));
}

export class SolarPanel extends Entity {
  constructor(x,y,{enabled=true,...rest}={}){
    super('solarPanel',x,y);this.name='Painel solar';this.peakPowerW=SOLAR_PANEL_PEAK_POWER_W;
    this.generationW=0;this.enabled=enabled;Object.assign(this,rest);
    this.peakPowerW=SOLAR_PANEL_PEAK_POWER_W;this.generationW=Math.max(0,Number(this.generationW)||0);
  }
  updateGeneration(hour){this.generationW=this.enabled&&!this.powerBlocked?this.peakPowerW*solarIrradiance(hour):0;return this.generationW;}
}
