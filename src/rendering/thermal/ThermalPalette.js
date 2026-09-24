export const THERMAL_STOPS = Object.freeze([
  { temp: 15, color: Object.freeze([15, 45, 150]) },
  { temp: 20, color: Object.freeze([20, 90, 220]) },
  { temp: 25, color: Object.freeze([20, 185, 215]) },
  { temp: 28, color: Object.freeze([60, 210, 100]) },
  { temp: 30, color: Object.freeze([245, 215, 45]) },
  { temp: 33, color: Object.freeze([250, 170, 35]) },
  { temp: 35, color: Object.freeze([250, 125, 25]) },
  { temp: 38, color: Object.freeze([245, 70, 35]) },
  { temp: 40, color: Object.freeze([235, 25, 50]) },
  { temp: 45, color: Object.freeze([215, 30, 65]) },
  { temp: 55, color: Object.freeze([180, 25, 70]) },
  { temp: 70, color: Object.freeze([140, 20, 65]) },
  { temp: 80, color: Object.freeze([110, 20, 55]) },
].map(stop => Object.freeze({ temp: stop.temp, color: stop.color })));

export const THERMAL_MIN = THERMAL_STOPS[0].temp;
export const THERMAL_MAX = THERMAL_STOPS.at(-1).temp;

export function thermalColor(temperature) {
  const first = THERMAL_STOPS[0], last = THERMAL_STOPS.at(-1);
  if (temperature <= first.temp) return [...first.color];
  if (temperature >= last.temp) return [...last.color];
  for (let i = 0; i < THERMAL_STOPS.length - 1; i++) {
    const a = THERMAL_STOPS[i], b = THERMAL_STOPS[i + 1];
    if (temperature <= b.temp) {
      const t = (temperature - a.temp) / (b.temp - a.temp);
      return a.color.map((channel, k) => Math.round(channel + (b.color[k] - channel) * t));
    }
  }
  return [...last.color];
}

export function thermalCss(temperature, alpha = 1) {
  const [r, g, b] = thermalColor(temperature);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Expand the operating range in the legend without changing absolute colors.
export function thermalLegendPosition(temperature) {
  if (temperature <= 15) return 0;
  if (temperature <= 25) return (temperature - 15) / 10 * .15;
  if (temperature <= 40) return .15 + (temperature - 25) / 15 * .6;
  return Math.min(1, .75 + (temperature - 40) / 40 * .25);
}

export function thermalState(temperature) {
  return temperature >= 30 ? thermalCss(temperature) : null;
}
