export const SimulationConfig = {
  conductionScale: 35,
  machinePassiveUA: 65,
  // Grid velocity is averaged over eight surface cells, below nozzle velocity.
  // Calibrated with the full 8/12/15 kW mission and production airflow solver.
  machineForcedUAperMS: 350,
  maxConductionEqualizationFraction: 0.45,
  airflowMixingFactor: 1.0,
  passiveOutdoorLeakWPerK: 2.5,
};
