export const SimulationConfig = {
  conductionScale: 35,
  machinePassiveUA: 65,
  // Grid velocity is averaged over eight surface cells, below nozzle velocity.
  // Calibrated with the full 8/12/15 kW mission and production airflow solver.
  machineForcedUAperMS: 395,
  // Server racks exchange heat through directed intake/exhaust faces and need
  // substantially stronger coupling than small standalone machines.
  rackPassiveUA: 450,
  rackForcedUAperMS: 5000,
  maxConductionEqualizationFraction: 0.45,
  airflowMixingFactor: 1.0,
  passiveOutdoorLeakWPerK: 2.5,
};
