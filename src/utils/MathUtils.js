export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const harmonicMean = (a, b) => (a <= 0 || b <= 0 ? 0 : (2 * a * b) / (a + b));
export const formatEnergy = (j) => {
  const abs = Math.abs(j);
  if (abs >= 1e9) return `${(j / 1e9).toFixed(2)} GJ`;
  if (abs >= 1e6) return `${(j / 1e6).toFixed(2)} MJ`;
  if (abs >= 1e3) return `${(j / 1e3).toFixed(1)} kJ`;
  return `${j.toFixed(0)} J`;
};
export const formatPower = (w) => (Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${w.toFixed(0)} W`);
export const rgbHeat = (temp,min=10,max=80) => {
  const t = clamp((temp - min) / Math.max(1,max-min), 0, 1);
  const stops = [
    [0.00, [20, 80, 220]],
    [0.25, [20, 190, 210]],
    [0.45, [40, 200, 90]],
    [0.62, [240, 215, 50]],
    [0.78, [245, 120, 35]],
    [1.00, [230, 35, 35]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (t >= a && t <= b) {
      const f = (t - a) / (b - a);
      return ca.map((v, k) => Math.round(lerp(v, cb[k], f)));
    }
  }
  return stops.at(-1)[1];
};
