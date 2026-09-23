export const VisualSettings={
  streamlines:true,
  streamlineDensity:1,
  airflowMode:'streamlines',
  heatHaze:true,
  heatHazeQuality:'high',
  maxHazeRegions:24,
  reduceMotion:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,
};

export const HEAT_HAZE_MODE_FACTOR={
  normal:1,
  airflow:.65,
  pressure:.30,
  thermal:.20,
  fluid:.35,
};
