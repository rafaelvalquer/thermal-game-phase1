const box=(x,y,z,sx,sy,sz)=>({x,y,z,sx,sy,sz});

export function condenserParts(kind){
  const industrial=kind==='coolingUnitIndustrial',depth=industrial?1.85:.85,front=-depth/2-.012;
  const fanCenters=industrial?[-.47,.47]:[0];
  const frontSlats=Array.from({length:9},(_,i)=>box(0,.22+i*.095,front-.028,.72,.022,.018));
  const sideRibs=Array.from({length:5},(_,i)=>box(-.423,.3+i*.18,0,.018,.028,depth-.08));
  const rings=fanCenters.map(z=>({x:0,y:1.285,z,sx:.59,sy:.59,sz:.59,rx:-Math.PI/2}));
  const hubs=fanCenters.map(z=>({x:0,y:1.292,z,sx:.12,sy:.045,sz:.12}));
  const blades=fanCenters.flatMap((centerZ,fanIndex)=>Array.from({length:4},(_,bladeIndex)=>({x:0,y:1.293,z:centerZ,sx:.10,sy:.025,sz:.22,fanIndex,bladeIndex,fanCenterZ:centerZ})));
  return [
    {key:'body',shape:'box',material:'condenserBody',pieces:[box(0,.65,0,.84,1.22,depth)]},
    {key:'side',shape:'box',material:'condenserSide',pieces:[box(.426,.65,0,.015,1.16,depth-.06)]},
    {key:'service',shape:'box',material:'condenserPanel',pieces:[box(0,.62,front,.77,1.05,.025)]},
    {key:'grille',shape:'box',material:'condenserGrille',pieces:frontSlats},
    {key:'side-ribs',shape:'box',material:'condenserGrille',pieces:sideRibs},
    {key:'top',shape:'box',material:'condenserTop',pieces:[box(0,1.258,0,.82,.04,depth-.04)]},
    {key:'fan-ring',shape:'torus',material:'fanRing',pieces:rings},
    {key:'fan-hub',shape:'cylinder',material:'fanHub',pieces:hubs},
    {key:'fan-blade',shape:'box',material:'fanBlade',pieces:blades,rotor:true},
    {key:'led',shape:'box',material:'led',pieces:[box(.31,1.12,front-.034,.038,.038,.014)],led:true},
    {key:'feet',shape:'box',material:'rackRail',pieces:[box(-.29,.02,-depth*.32,.12,.04,.16),box(.29,.02,-depth*.32,.12,.04,.16),box(-.29,.02,depth*.32,.12,.04,.16),box(.29,.02,depth*.32,.12,.04,.16)]},
  ];
}
