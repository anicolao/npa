export type Value = boolean | number | string | undefined;
export type Patch = [string, Patch | Value][] | Value | object;
const EMPTY = {};
export function diff<T extends Value | object>(a: T, b: T): Patch {
  if (a === b) {
    return a;
  }
  if (
    typeof b === "boolean" ||
    typeof b === "number" ||
    typeof b === "string" ||
    typeof b === "undefined"
  ) {
    return b;
  }
  let oldA: { [k: string]: Value } = a as { [k: string]: Value };
  let newA: { [k: string]: Value } = b as { [k: string]: Value };
  if (oldA === undefined) {
    return b;
  }
  if (typeof b === "object" && typeof a !== "object") {
    throw `type mismatch, ${typeof a} vs ${typeof b}`;
  }
  let ret = Object.entries(oldA)
    .map((e): [string, Patch | Value] => {
      return [e[0], diff(oldA[e[0]], newA[e[0]])];
    })
    .filter((e) => e[1] !== oldA[e[0]]);
  ret = ret.concat(Object.entries(b).filter((e) => oldA[e[0]] === undefined));
  if (ret.length === 0) {
    return a;
  }
  return ret;
}

type Patch2 = { [k: string]: any } | Value;
export function diff2<T extends Value | object>(a: T, b: T): Patch2 {
  if (a === b) {
    return null;
  }
  if (a === undefined || typeof b !== "object" || typeof b !== typeof a) {
    return b;
  }
  let oldA: { [k: string]: Value } = a as { [k: string]: Value };
  let newA: { [k: string]: Value } = b as { [k: string]: Value };
  if (typeof b === "object" && typeof a !== "object") {
    throw `type mismatch, ${typeof a} vs ${typeof b}`;
  }
  let ret: { [k: string]: any } = {};
  let entries = 0;
  Object.entries(oldA).forEach((e) => {
    const d = diff2(oldA[e[0]], newA[e[0]]);
    if (d !== null) {
      ++entries;
      ret[e[0]] = d === undefined ? null : d;
    }
  });
  Object.entries(b)
    .filter((e) => oldA[e[0]] === undefined)
    .forEach((e) => {
      ++entries;
      ret[e[0]] = newA[e[0]];
    });
  if (entries === 0) return null;
  return ret;
}

export function patch2(a: Patch2, p: Patch2): Patch2 {
  if (p === null) {
    return a;
  }
  if (typeof a !== typeof p) {
    return p;
  }
  if (typeof p !== "object") return p;
  let newA: { [k: string]: Patch2 } = a as { [k: string]: Patch2 };
  Object.entries(p).forEach((e) => {
    if (e[1] === null) {
      delete newA[e[0]];
    } else {
      newA[e[0]] = patch2(newA[e[0]], e[1]);
    }
  });
  if (Array.isArray(newA)) {
    return newA.filter((x: any) => x !== undefined);
  }
  return newA;
}

export function patch<T extends Value | object>(a: T, p: Patch) {
  if (
    typeof p === "boolean" ||
    typeof p === "number" ||
    typeof p === "string" ||
    typeof p === "undefined" ||
    a === p
  ) {
    return p;
  }
  let ret: { [k: string]: any } = a as any;
  if ((p as any).forEach) {
    (p as any).forEach((pair: [string, Patch]) => {
      if (ret[pair[0]] === undefined) {
        ret[pair[0]] = {};
      }
      ret[pair[0]] = patch(ret[pair[0]], pair[1]);
    });
  } else {
    ret = p;
  }
  if (ret.filter) {
    return ret.filter((x: any) => x !== undefined);
  }
  const deleteKeys = Object.entries(ret)
    .filter((e) => e[1] === undefined)
    .map((e) => e[0]);
  deleteKeys.forEach((k) => delete ret[k]);
  return ret;
}
