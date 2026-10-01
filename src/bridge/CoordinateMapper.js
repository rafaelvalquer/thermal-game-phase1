export const TILE_SIZE_METERS=1;

export class CoordinateMapper {
  constructor(tileSize=TILE_SIZE_METERS){this.tileSize=Number(tileSize)||TILE_SIZE_METERS;}
  tileCenter(tileX,tileY,height=0){return{x:(tileX+.5)*this.tileSize,y:height,z:(tileY+.5)*this.tileSize};}
  tileOrigin(tileX,tileY){return{x:tileX*this.tileSize,z:tileY*this.tileSize};}
  worldToTile(x,z){return{x:Math.floor(x/this.tileSize),y:Math.floor(z/this.tileSize)};}
  mapCenter(width,height,elevation=0){return{x:width*this.tileSize/2,y:elevation,z:height*this.tileSize/2};}
  directionToYaw(direction={x:0,y:-1}){const x=Number(direction.x)||0,y=Number(direction.y)||0,angle=Math.atan2(-x,-y);return angle===0?0:Math.abs(angle)===Math.PI?Math.PI:angle;}
}

export const coordinateMapper=new CoordinateMapper();
