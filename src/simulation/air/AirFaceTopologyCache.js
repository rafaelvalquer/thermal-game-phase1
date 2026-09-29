export class AirFaceTopologyCache {
  constructor(grid){
    this.grid=grid;this.topologyVersion=-1;this.worldTopologyVersion=-1;
    this.openUFaces=new Int32Array(0);this.openULeft=new Int32Array(0);this.openURight=new Int32Array(0);
    this.openVFaces=new Int32Array(0);this.openVTop=new Int32Array(0);this.openVBottom=new Int32Array(0);
    this.velocityUFaces=new Int32Array(0);this.velocityUX=new Int32Array(0);this.velocityUY=new Int32Array(0);
    this.velocityVFaces=new Int32Array(0);this.velocityVX=new Int32Array(0);this.velocityVY=new Int32Array(0);
    this.airCells=new Int32Array(0);this.exteriorAirCells=new Int32Array(0);this.boundaryCells=new Int32Array(0);
    this.openUCount=0;this.openVCount=0;this.airCellCount=0;this.exteriorAirCellCount=0;this.boundaryCellCount=0;
  }

  ensure(){
    const g=this.grid,worldVersion=g.world.airTopologyVersion??0;
    if(this.topologyVersion===g.topologyVersion&&this.worldTopologyVersion===worldVersion)return false;
    this.topologyVersion=g.topologyVersion;this.worldTopologyVersion=worldVersion;
    const {width,height,size,solid,exteriorCells}=g,blockedU=[],leftU=[],rightU=[],blockedV=[],topV=[],bottomV=[],velocityU=[],velocityUX=[],velocityUY=[],velocityV=[],velocityVX=[],velocityVY=[],air=[],outside=[],boundary=[];
    const excludedU=new Set(),excludedV=new Set();
    for(const opening of g.world.airExteriorOpenings||[]){
      const {x,y,direction}=opening;
      if(direction.x)excludedU.add(g.uIndex(direction.x>0?x+1:x,y));
      else excludedV.add(g.vIndex(x,direction.y>0?y+1:y));
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=y*width+x;if(solid[i])continue;
      air.push(i);if(exteriorCells[i])outside.push(i);
      if(x===0||y===0||x===width-1||y===height-1)boundary.push(i);
      if(x>0&&!solid[i-1]){const face=g.uIndex(x,y);velocityU.push(face);velocityUX.push(x);velocityUY.push(y);if(!excludedU.has(face)){blockedU.push(face);leftU.push(i-1);rightU.push(i);}}
      if(y>0&&!solid[i-width]){const face=g.vIndex(x,y);velocityV.push(face);velocityVX.push(x);velocityVY.push(y);if(!excludedV.has(face)){blockedV.push(face);topV.push(i-width);bottomV.push(i);}}
    }
    this.openUFaces=Int32Array.from(blockedU);this.openULeft=Int32Array.from(leftU);this.openURight=Int32Array.from(rightU);this.openUCount=blockedU.length;
    this.openVFaces=Int32Array.from(blockedV);this.openVTop=Int32Array.from(topV);this.openVBottom=Int32Array.from(bottomV);this.openVCount=blockedV.length;
    this.velocityUFaces=Int32Array.from(velocityU);this.velocityUX=Int32Array.from(velocityUX);this.velocityUY=Int32Array.from(velocityUY);
    this.velocityVFaces=Int32Array.from(velocityV);this.velocityVX=Int32Array.from(velocityVX);this.velocityVY=Int32Array.from(velocityVY);
    this.airCells=Int32Array.from(air);this.airCellCount=air.length;this.exteriorAirCells=Int32Array.from(outside);this.exteriorAirCellCount=outside.length;this.boundaryCells=Int32Array.from(boundary);this.boundaryCellCount=boundary.length;
    return true;
  }
}
