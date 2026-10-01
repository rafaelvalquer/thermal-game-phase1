import { createThreeBenchmarkSnapshot, THREE_BENCHMARK_MODES, THREE_BENCHMARK_SCENARIOS } from '../src/dev/ThreePerformanceBenchmark.js';

const profiles=Object.keys(THREE_BENCHMARK_SCENARIOS),checks=[];
for(const profile of profiles){
  const config=THREE_BENCHMARK_SCENARIOS[profile],snapshot=createThreeBenchmarkSnapshot(profile),counts={};
  for(const record of snapshot.equipment)counts[record.type]=(counts[record.type]||0)+1;
  if(counts.serverRack+counts.computeRack!==config.racks)throw new Error(`${profile}: rack count mismatch`);
  if(counts.duct!==config.ducts)throw new Error(`${profile}: duct count mismatch`);
  if(snapshot.world.width!==128||snapshot.world.height!==80)throw new Error(`${profile}: expected 128×80 map`);
  checks.push({profile,...config,equipment:snapshot.equipment.length,modes:THREE_BENCHMARK_MODES.length,instancing:true});
}
console.log(JSON.stringify({kind:'three-benchmark-structural-gate',ok:true,profiles:checks,modes:THREE_BENCHMARK_MODES,browserWebGLMeasurement:'npm run dev -- --host 127.0.0.1, then open http://localhost:5173/?benchmark3d=1; use &profiles=A&frames=120 to filter the run'},null,2));
