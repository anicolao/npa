export type Value = boolean | number | string | undefined;
export type Patch = [string, Patch | Value][] | Value | object;
export function diff<T extends Value | object>(a: T, b: T): Patch {
  if (a === b) {
    return a;
  }
  if (
    typeof b === "boolean" ||
    typeof b === "number" ||
    typeof b === "string"
  ) {
    return b;
  }
  if (typeof b === "object" && typeof a !== "object") {
    throw `type mismatch, ${typeof a} vs ${typeof b}`;
  }
  const oldA: { [k: string]: Value } = a as { [k: string]: Value };
  const newA: { [k: string]: Value } = b as { [k: string]: Value };
  const ret = Object.entries(a)
    .map((e): [string, Patch | Value] => {
      return [e[0], diff(oldA[e[0]], newA[e[0]])];
    })
    .filter((e) => e[1] !== oldA[e[0]]);
  if (ret.length === 0) {
    return a;
  }
  return ret;
}

export function patch<T extends Value | object>(a: T, p: Patch) {
  if (
    typeof p === "boolean" ||
    typeof p === "number" ||
    typeof p === "string" ||
    a === p
  ) {
    return p;
  }
  let ret: { [k: string]: any } = a as any;
  (p as any).forEach((pair: [string, Patch]) => {
    ret[pair[0]] = patch(ret[pair[0]], pair[1]);
  });
  return ret;
}
