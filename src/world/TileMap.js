import { Tile } from './Tile.js';
export class TileMap {
  constructor(world) { this.world = world; }
  get(x, y) { return this.world.inBounds(x,y) ? new Tile(this.world,x,y) : null; }
  setMaterial(x, y, id) { return this.world.setMaterial(x,y,id); }
}
