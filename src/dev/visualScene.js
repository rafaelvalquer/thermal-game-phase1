import { World } from '../world/World.js';
import * as E from '../entities/index.js';
import { FluidSystem } from '../simulation/FluidSystem.js';
import { CoolingNetworkBuilder } from '../simulation/cooling/CoolingNetworkBuilder.js';
export function createVisualScene(dense=false){
  const world=new World(dense?70:44,dense?40:20);
  const zones=[{x:0,y:0,width:14,height:world.height,visualStyle:'server'},{x:14,y:0,width:14,height:world.height,visualStyle:'industrial'},{x:28,y:0,width:16,height:world.height,visualStyle:'lab'}];
  const types=['ServerRack','Machine','Furnace','Fan','ExhaustFan','Pump','WaterTank','Radiator','HeatExchanger','TemperatureSensor','CoolingUnit','SupplyVent','PassiveHeatSource'];
  for(let row=0;row<(dense?16:4);row++)types.forEach((type,col)=>{
    const entity=new E[type](2+col*(dense?5:3),3+row*(dense?2:3));
    entity.id=`visual-${row}-${col}`;
    Object.assign(entity,{enabled:row%4!==1,powerBlocked:row%4===2,started:true,flowRate:.8,currentVelocity:2,currentFlow:1,currentAirFlow:2,loadMultiplier:1,thermalPower:3000,coolingPower:2000,heatGenerationPower:7000,networkStatus:'READY',status:'NORMAL',circuitClosed:true,airInTemperature:25});
    if(entity.type==='coolingUnit'){entity.tier=['compact','commercial','industrial'][row%3];entity.footprintLength=entity.tier==='industrial'?2:1;}
    if(entity.direction)entity.direction=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}][row%4];
    if(entity.isHeatMachine&&row%4===3)entity.energy=entity.mass*entity.heatCapacity*85;
    world.addEntity(entity);
  });
  for(let x=1;x<world.width-1;x++)world.setMaterial(x,1,x<14?'concrete':x<28?'insulation':'copper');
  // Real network topology in a separate aisle; demo rows above keep their fixed states.
  const bottom=world.height-2;
  for(let x=1;x<=14;x++)for(const y of [bottom-2,bottom])world.addEntity(x===1&&y===bottom-2?new E.Pump(x,y,{x:1,y:0}):x===7&&y===bottom-2?new E.HeatExchanger(x,y):x===12&&y===bottom?new E.Radiator(x,y):new E.Pipe(x,y));
  world.addEntity(new E.WaterTank(1,bottom-1));world.addEntity(new E.Pipe(14,bottom-1));
  const fluid=new FluidSystem(world,{}),networks=fluid.buildNetworks();for(const network of networks)fluid.solveNetwork(network);
  // Restore the deliberately demonstrated row states after hydraulic diagnostics.
  for(const e of world.entities.filter(e=>String(e.id).startsWith('visual-'))){e.networkStatus='READY';e.circuitClosed=true;e.flowRate=.8;}
  const unit=world.addEntity(new E.CoolingUnit(20,bottom-1)),vent=world.addEntity(new E.SupplyVent(28,bottom-1));
  for(let x=21;x<=27;x++)world.addUtility(new E.AirDuct(x,bottom-1));
  const cooling={networks:new CoolingNetworkBuilder(world).build(),units:[unit]};
  for(const network of cooling.networks){for(const path of network.paths){path.flowRate=1;path.vent.flowRate=1;path.vent.airTemperature=16;}for(const e of [...network.ducts,...network.vents,...network.sourceUnits]){e.networkId=network.id;e.networkStatus=network.status;}}
  unit.currentAirFlow=1;unit.status='NORMAL';world.coolingSystem=cooling;
  for(let i=0;i<world.size;i++){world.airX[i]=.4;world.airY[i]=.05;}
  return {world,zones,sim:{visualTime:0,elapsed:0,metrics:{},mission:{events:{},failures:null},cooling}};
}

export function createTechnicianScene(){
  const world=new World(24,20),directions=[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}];
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const x=3+col*5,y=3+row*5,d=directions[col],worker=world.addEntity(new E.Technician(x,y));
    Object.assign(worker,{id:`pose-${row}-${col}`,facing:d,action:['patrolling','moving','working'][row],fromX:x,fromY:y,toX:x+d.x,toY:y+d.y,path:row===1?[{x:x+d.x,y:y+d.y}]:[],pathIndex:0});
    if(row===2){const rack=world.addEntity(new E.ServerRack(x+d.x*2,y+d.y*2));worker.targetRackId=rack.id;worker.boostRemaining=8;}
  }
  return {world,zones:[],sim:{visualTime:0,elapsed:0,metrics:{},mission:{events:{},failures:null}},update(time){
    for(const worker of world.entitiesByType('technician')){
      if(worker.action==='moving')worker.moveProgress=(time*.65)%1;
      if(worker.action==='working')worker.workProgress=(time/8)%1;
    }
  }};
}
