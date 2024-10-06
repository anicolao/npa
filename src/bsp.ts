export interface Point {
  x: number;
  y: number;
}
interface Node {
  left: Node | null;
  right: Node | null;
  value: Point;
}

export class BspTree {
  keys: string[];
  root: Node | null = null;
  constructor(data: { [k: string]: Point }) {
    this.keys = Object.keys(data);
    this.keys.sort((a, b) => data[a].x - data[b].x);
    const index = Math.trunc(this.keys.length / 2);
    const value = data[this.keys[index]];
    this.root = {
      left: null,
      right: null,
      value,
    };
    for (let i = 0; i < index; ++i) {
      const k = this.keys[i];
      this.insert(this.root, data[k], 0);
    }
    for (let i = index + 1; i < this.keys.length; ++i) {
      const k = this.keys[i];
      this.insert(this.root, data[k], 0);
    }
  }

  insert(node: Node, p: Point, level: number) {
    const goLeft = level % 2 === 0 ? p.x < node.value.x : p.y < node.value.y;
    if (goLeft) {
      if (node.left) {
        this.insert(node.left, p, level + 1);
      } else {
        node.left = {
          left: null,
          right: null,
          value: p,
        };
      }
    } else {
      if (node.right) {
        this.insert(node.right, p, level + 1);
      } else {
        node.right = {
          left: null,
          right: null,
          value: p,
        };
      }
    }
  }

  find(p: Point, r: number) {
    return this.rfind(this.root, p, r, 0);
  }

  distanceSquared(p0: Point, p1: Point) {
    const xoff = p0.x - p1.x;
    const yoff = p0.y - p1.y;
    return xoff * xoff + yoff * yoff;
  }
  rfind(node: Node, p: Point, r: number, level: number) {
    if (node === null) {
      return [];
    }
    let goLeft = false;
    let goRight = false;
    if (level % 2 === 0) {
      goLeft = p.x - r < node.value.x;
      goRight = p.x + r > node.value.x;
    } else {
      goLeft = p.y - r < node.value.y;
      goRight = p.y + r > node.value.y;
    }
    let ret = [];
    if (this.distanceSquared(node.value, p) < r * r) {
      ret.push(node.value);
    }
    if (goLeft) {
      ret = [...ret, ...this.rfind(node.left, p, r, level + 1)];
    }
    if (goRight) {
      ret = [...ret, ...this.rfind(node.right, p, r, level + 1)];
    }
    return ret;
  }

  rfindMany(node: Node, points: Point[], r: number, level: number) {
    if (node === null) {
      return [];
    }
    let goLeft: Point[] = [];
    let goRight: Point[] = [];
    if (level % 2 === 0) {
      goLeft = points.filter((p) => p.x - r < node.value.x);
      goRight = points.filter((p) => p.x + r > node.value.x);
    } else {
      goLeft = points.filter((p) => p.y - r < node.value.y);
      goRight = points.filter((p) => p.y + r > node.value.y);
    }
    let ret = [];
    for (const p of points) {
      if (this.distanceSquared(node.value, p) < r * r) {
        ret.push(node.value);
        break;
      }
    }
    if (goLeft.length > 0) {
      ret = [...ret, ...this.rfindMany(node.left, goLeft, r, level + 1)];
    }
    if (goRight.length > 0) {
      ret = [...ret, ...this.rfindMany(node.right, goRight, r, level + 1)];
    }
    return ret;
  }
  findMany(points: Point[], r: number) {
    return this.rfindMany(this.root, points, r, 0);
  }

  size() {
    return this.keys.length;
  }
}
