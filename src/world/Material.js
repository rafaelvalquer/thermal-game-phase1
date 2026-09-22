export class Material {
  constructor({ id, name, density, heatCapacity, conductivity, color, solid = false }) {
    Object.assign(this, { id, name, density, heatCapacity, conductivity, color, solid });
  }
}
