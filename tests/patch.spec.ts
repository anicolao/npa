import { expect } from "chai";
import { describe, it } from "vitest";
import { diff, patch } from "../src/patch";
import { turn345, turn346, example1 } from "./patchdata";

describe("diff/patch work as expected", () => {
  it("diff test boolean", () => {
    expect(diff(true, false)).to.equal(false);
  });

  it("diff test numbers", () => {
    expect(diff(3, 7)).to.equal(7);
  });
  it("diff test strings", () => {
    expect(diff("hello", "world")).to.equal("world");
  });
  it("diff test arrays", () => {
    expect(diff([1, 3, 3], [1, 2, 3])).to.deep.equal({ "1": 2 });
  });
  it("diff test objects", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    expect(diff({ a, b: "c", c }, { a, b, c })).to.deep.equal({ b: "b" });
  });
  it("diff test object key changes type", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    const d = diff({ a, b: "c", c }, { a, b: { obj: "hello" }, c });
    expect(d).to.deep.equal({ b: { obj: "hello" } });
    expect(patch({ a, b: "c", c }, d)).to.deep.equal({
      a,
      b: { obj: "hello" },
      c,
    });
  });

  it("diff add an objects", () => {
    const a = "a";
    const b = { obj: "hello" };
    const c = "c";
    const d = diff({ a, c }, { a, b, c });
    expect(d).to.deep.equal({ b: { obj: "hello" } });
    expect(patch({ a, c }, d)).to.deep.equal({ a, b, c });
  });

  it("diff test identical objects", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    const o = { a, b, c };
    expect(diff(o, o)).to.deep.equal(null);
  });
  it("diff test equal objects", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    const o = { a, b, c };
    expect(diff(o, { ...o })).to.deep.equal(null);
  });
  it("diff test and patch a player", () => {
    const Toko0 = {
      "0": {
        ai: 0,
        alias: "TokoBalthar",
        avatar: 38,
        conceded: 0,
        huid: 21,
        karma_to_give: 16,
        missed_turns: 0,
        ready: 0,
        regard: 0,
        tech: {
          banking: {
            level: 2,
            value: 2,
          },
          manufacturing: {
            level: 1,
            value: 1,
          },
          propulsion: {
            level: 1,
            value: 0.5,
          },
          research: {
            level: 3,
            value: 360,
          },
          scanning: {
            level: 3,
            value: 0.625,
          },
          terraforming: {
            level: 2,
            value: 2,
          },
          weapons: {
            level: 2,
            value: 2,
          },
        },
        total_economy: 10,
        total_fleets: 3,
        total_industry: 10,
        total_science: 6,
        total_stars: 11,
        total_strength: 246,
        uid: 0,
      },
    };
    const Toko1 = {
      "0": {
        ai: 0,
        alias: "TokoBalthar",
        avatar: 38,
        conceded: 0,
        huid: 21,
        karma_to_give: 16,
        missed_turns: 0,
        ready: 0,
        regard: 0,
        tech: {
          banking: {
            level: 2,
            value: 2,
          },
          manufacturing: {
            level: 1,
            value: 1,
          },
          propulsion: {
            level: 1,
            value: 0.5,
          },
          research: {
            level: 3,
            value: 360,
          },
          scanning: {
            level: 3,
            value: 0.625,
          },
          terraforming: {
            level: 2,
            value: 2,
          },
          weapons: {
            level: 2,
            value: 2,
          },
        },
        total_economy: 11,
        total_fleets: 3,
        total_industry: 11,
        total_science: 7,
        total_stars: 11,
        total_strength: 256,
        uid: 0,
      },
    };
    expect(diff(Toko0, Toko1)).to.deep.equal({
      "0": {
        total_economy: 11,
        total_industry: 11,
        total_science: 7,
        total_strength: 256,
      },
    });
    const d = diff(Toko0, Toko1);
    const t1 = patch(Toko0, d);
    expect(diff(Toko1, t1)).to.equal(null);
  });

  it("test patch [] does nothing to a player", () => {
    const Toko0 = {
      "0": {
        ai: 0,
        alias: "TokoBalthar",
        avatar: 38,
        conceded: 0,
        huid: 21,
        karma_to_give: 16,
        missed_turns: 0,
        ready: 0,
        regard: 0,
        tech: {
          banking: {
            level: 2,
            value: 2,
          },
          manufacturing: {
            level: 1,
            value: 1,
          },
          propulsion: {
            level: 1,
            value: 0.5,
          },
          research: {
            level: 3,
            value: 360,
          },
          scanning: {
            level: 3,
            value: 0.625,
          },
          terraforming: {
            level: 2,
            value: 2,
          },
          weapons: {
            level: 2,
            value: 2,
          },
        },
        total_economy: 10,
        total_fleets: 3,
        total_industry: 10,
        total_science: 6,
        total_stars: 11,
        total_strength: 246,
        uid: 0,
      },
    };
    const t0 = patch(Toko0, null);
    expect(diff(Toko0, t0)).to.equal(null);
  });
  it("test real-world patch example", () => {
    const d = diff(turn345, turn346);
    const t346 = patch(turn345, d);
    expect(turn346).to.deep.equal(t346);
    expect(diff(turn346, t346)).to.equal(null);
    expect(d).to.deep.equal({
      scanning_data: {
        now: 1673302500857,
        players: {
          "6": {
            total_economy: 16,
            total_fleets: 6,
            total_industry: 17,
          },
          "7": {
            tech: {
              manufacturing: {
                level: 2,
                value: 2,
              },
              terraforming: {
                level: 2,
                value: 2,
              },
            },
          },
        },
        tick_fragment: 1.00118722222222,
      },
    });
  });

  it("can delete an element of an array", () => {
    const dd = diff([1, 2, 3], [1, 3]);
    expect(dd).to.deep.equal({
      "1": 3,
      "2": null,
    });
    const delExample = patch([1, 2, 3], dd);
    expect(delExample).to.deep.equal([1, 3]);
  });
  it("can delete an key of an object", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    const dd = diff({ a, b, c }, { a, c });
    expect(dd).to.deep.equal({ b: null });
    const delExample = patch({ a, b, c }, dd);
    expect(delExample).to.deep.equal({ a, c });
  });

  it("can add a key to an object", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    const insert = diff({ a, c }, { a, b, c });
    expect(insert).to.deep.equal({ b });
    const insertExample = patch({ a, c }, insert);
    expect(insertExample).to.deep.equal({ a, b, c });
  });

  it("can delete a nested array", () => {
    const nest = [1, 2, 3];
    const before = { o: [nest, [...nest]] };
    const after: any = { o: [nest] };
    const dd = diff(before, after);
    expect(dd).to.deep.equal({ o: { "1": null } });
    const check = patch(before, dd);
    expect(check).to.deep.equal({ o: [nest] });
  });

  it("gets a correct result from live data", () => {
    const a = example1.newer;
    const b = example1.older;
    const d = diff(a, b);
    const regen = patch(a, d);
    const identical = diff(b, regen);
    expect(identical).to.equal(null);
  });

  it("doesn't corrupt a diff if patched again", () => {
    const a = {};
    const b = { k: 5 };
    const d = diff(a, b);
    const next = patch(a, d);
    expect(typeof d).to.equal("object");
    expect(typeof next).to.equal("object");
    if (typeof d === "object" && typeof next === "object") {
      expect(d.k).to.equal(5);
      expect(next.k).to.equal(5);
      next.k = 10;
      expect(d.k).to.equal(5);
    }
  });

  it("doesn't corrupt a diff if source is modified", () => {
    const a = {};
    const b = { a: { k: 5 } };
    const d = diff(a, b);
    expect(typeof d).to.equal("object");
    if (typeof d === "object") {
      expect(d.a.k).to.equal(5);
      expect(b.a.k).to.equal(5);
      b.a.k = 10;
      expect(d.a.k).to.equal(5);
    }
  });

  it("correctly diffs nested arrays", () => {
    const emptyO: number[][] = [];
    const a = {
      "55": {
        n: "Garnet I",
        o: emptyO,
      },
    };
    const b = {
      "55": {
        n: "Garnet I",
        o: [[0, 349, 0, 0]],
      },
    };
    const d = diff(a, b);
    const bNew = patch(a, d);
    const nullAnswer = diff(b, bNew);
    expect(nullAnswer).to.equal(null);
  });
});
