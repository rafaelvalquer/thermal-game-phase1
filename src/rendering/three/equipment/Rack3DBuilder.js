const box=(x,y,z,sx,sy,sz)=>({x,y,z,sx,sy,sz});

export function rackParts(kind){
  const gpu=kind==='computeRackGpu',storage=kind==='computeRackStorage',managed=kind==='serverRack';
  const slotCount=gpu?6:storage?10:managed?9:12;
  const slotHeight=gpu?.25:storage?.155:managed?.185:.135;
  const spacing=(1.72-slotHeight)/(slotCount-1);
  const slots=Array.from({length:slotCount},(_,i)=>box(0,.2+i*spacing+slotHeight/2,-.434,.56,slotHeight-.016,.045));
  const rails=[-.328,.328].map(x=>box(x,1.02,-.446,.034,1.98,.045));
  const crossbars=[.055,2.015].map(y=>box(0,y,-.446,.69,.05,.05));
  const vents=slots.map(slot=>box(-.16,slot.y,-.466,.17,.018,.012));
  const leds=slots.map(slot=>box(.245,slot.y,-.468,.025,.025,.013));
  const parts=[
    {key:'body',shape:'box',material:'rackBody',pieces:[box(0,1.02,0,.72,2.04,.84)]},
    {key:'side',shape:'box',material:'rackSide',pieces:[box(-.371,1.02,0,.018,1.98,.84),box(.371,1.02,0,.018,1.98,.84)]},
    {key:'rails',shape:'box',material:'rackRail',pieces:[...rails,...crossbars]},
    {key:'module',shape:'box',material:gpu?'gpuModule':storage?'storageModule':managed?'managedModule':'cpuModule',pieces:slots},
    {key:'vent',shape:'box',material:'rackVent',pieces:vents},
    {key:'led',shape:'box',material:'led',pieces:leds,led:true},
    {key:'badge',shape:'box',material:gpu?'gpuBadge':storage?'storageBadge':managed?'managedBadge':'cpuBadge',pieces:[box(0,1.93,-.473,.22,.045,.012)]},
    {key:'feet',shape:'box',material:'rackRail',pieces:[box(-.27,.025,-.29,.09,.05,.12),box(.27,.025,-.29,.09,.05,.12),box(-.27,.025,.29,.09,.05,.12),box(.27,.025,.29,.09,.05,.12)]},
  ];
  if(gpu)parts.push({key:'gpu-fans',shape:'cylinder',material:'rackFan',pieces:slots.flatMap(slot=>[-.115,.11].map(x=>({...box(x,slot.y,-.471,.075,.008,.075),rx:Math.PI/2})))});
  if(storage)parts.push({key:'drive-bays',shape:'box',material:'driveBay',pieces:slots.flatMap(slot=>[-.17,-.055,.06,.175].map(x=>box(x,slot.y,-.469,.085,.105,.012)))});
  if(managed)parts.push({key:'managed-band',shape:'box',material:'managedBadge',pieces:[box(-.29,1.03,-.471,.017,1.7,.012)]});
  return parts;
}
