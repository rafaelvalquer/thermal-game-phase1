export class Tile {
  constructor(world, x, y) { this.world = world; this.x = x; this.y = y; }
  get index() { return this.world.index(this.x, this.y); }
  get material() { return this.world.materialAt(this.x, this.y); }
  get temperature() { return this.world.temperatureAt(this.x, this.y); }
  get thermalEnergy() { return this.world.energy[this.index]; }
  get airflowX() { return this.world.airX[this.index]; }
  get airflowY() { return this.world.airY[this.index]; }
}
