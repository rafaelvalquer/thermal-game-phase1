import { TILE_SIZE_METERS } from '../../utils/Constants.js';

export const AIR={
  density:1.225,
  cp:1005,
  kinematicViscosity:1.5e-5,
  eddyViscosity:0.45,
  cellSize:TILE_SIZE_METERS,
  roomHeight:2.5,
  pressureIterations:40,
  wallDrag:0.005,
  wallDragQuadratic:0.0015,
  wallTurbulenceSuppression:1.15,
  velocityDamping:0.006,
  maxVelocity:14,
  minRenderableVelocity:0.03,
  fanResponse:7,
};

export const AIR_FACE_AREA=TILE_SIZE_METERS*AIR.roomHeight;
