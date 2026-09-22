import { TILE_SIZE_METERS } from '../../utils/Constants.js';

export const AIR={
  density:1.225,
  cp:1005,
  kinematicViscosity:1.5e-5,
  eddyViscosity:0.09,
  cellSize:TILE_SIZE_METERS,
  roomHeight:2.5,
  pressureIterations:30,
  wallDrag:0.12,
  wallDragQuadratic:0.035,
  velocityDamping:0.006,
  maxVelocity:14,
  minRenderableVelocity:0.03,
  fanResponse:9,
};

export const AIR_FACE_AREA=TILE_SIZE_METERS*AIR.roomHeight;
