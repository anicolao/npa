export type Comparator<T> = (a: T, b: T) => number;

export class Heap<T> {
  a: T[];
  c: Comparator<T>;

  constructor(data: T[], comparator: Comparator<T>) {
    this.c = comparator;
    this.a = [...data];
    for (let h = this.parent(this.a.length); h >= 0; --h) {
      this.heapify(h);
    }
  }
  size() {
    return this.a.length;
  }
  peek() {
    return this.a[0];
  }
  extract() {
    const ret = this.a[0];
    const last = this.a.splice(-1)[0];
    if (this.size() > 0) {
      this.a[0] = last;
      this.heapify(0);
    }
    return ret;
  }
  parent(i: number) {
    return Math.floor((i - 1) >> 1);
  }
  left(i: number) {
    return (i << 1) + 1;
  }
  right(i: number) {
    return (i << 1) + 2;
  }
  heapify(i: number) {
    const left = this.left(i);
    const right = this.right(i);
    const c = this.c;
    const d = this.a;
    let min = i;
    if (d[left] !== undefined && c(d[min], d[left]) <= 0) {
      min = left;
    }
    if (d[right] !== undefined && c(d[min], d[right]) <= 0) {
      min = right;
    }
    if (min !== i) {
      const t = d[i];
      d[i] = d[min];
      d[min] = t;
      this.heapify(min);
    }
  }
}
