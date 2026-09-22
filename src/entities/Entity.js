let NEXT_ID = 1;
export class Entity {
  constructor(type, x, y) {
    this.id = NEXT_ID++;
    this.type = type;
    this.x = x;
    this.y = y;
    this.enabled = true;
  }
}
