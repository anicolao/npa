import { describe, expect, it } from "vitest";
import { clone, diff, patch, reversePatch } from "../src/patch";

describe("sparse reverse patches", () => {
  it.each([
    [
      { stars: { 1: { st: 20, n: "A" }, 2: { st: 1 } } },
      { stars: { 1: { st: 21, n: "A" }, 3: { st: 2 } } },
    ],
    [
      {
        fleets: {
          1: {
            o: [
              [0, 2, 1, 0],
              [0, 3, 2, 0],
            ],
          },
        },
      },
      { fleets: { 1: { o: [[0, 3, 2, 0]] } } },
    ],
    [{ list: [1, 2, 3] }, { list: [3] }],
    [{ value: 1 }, { value: { a: 2 } }],
    [{ value: { a: 2 } }, { value: 1 }],
    [{ a: 1 }, { a: 1 }],
    [{ list: [] }, { list: [[0, 3, 1, 0]] }],
  ])("restores the previous scan %#", (before, after) => {
    const original = clone(before);
    const delta = diff(before, after);
    const undo = reversePatch(before, delta);
    const next = patch(clone(before), delta);
    expect(next).toEqual(after);
    expect(patch(next, undo)).toEqual(before);
    expect(before).toEqual(original);
  });

  it("does not visit unaffected galaxy branches", () => {
    const before = {
      tick: 1,
      get stars() {
        throw new Error("unrelated stars visited");
      },
    };
    expect(reversePatch(before, { tick: 2 })).toEqual({ tick: 1 });
  });

  it("handles array compaction rather than restoring values at stale indices", () => {
    const before = { list: [1, 2, 3, 4] };
    const delta = { list: { 1: null } };
    const undo = reversePatch(before, delta);
    expect(patch(patch(clone(before), delta), undo)).toEqual(before);
  });
});
