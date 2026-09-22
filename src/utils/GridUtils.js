export const CARDINALS = [[1,0],[-1,0],[0,1],[0,-1]];
export const keyOf = (x, y) => `${x},${y}`;
export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
