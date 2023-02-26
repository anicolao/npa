import { expect } from "chai";
import { describe, it } from "vitest";
import { diff, patch } from "../src/patch";
import { turn345, turn346 } from "./patchdata";

describe("diff produces good patches", () => {
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
    expect(diff([1, 3, 3], [1, 2, 3])).to.deep.equal([["1", 2]]);
  });
  it("diff test objects", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    expect(diff({ a, b: "c", c }, { a, b, c })).to.deep.equal([["b", "b"]]);
  });
  it("diff test identical objects", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    const o = { a, b, c };
    expect(diff(o, o)).to.deep.equal(o);
  });
  it("diff test equal objects", () => {
    const a = "a";
    const b = "b";
    const c = "c";
    const o = { a, b, c };
    expect(diff(o, { ...o })).to.deep.equal(o);
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
    expect(diff(Toko0, Toko1)).to.deep.equal([
      [
        "0",
        [
          ["total_economy", 11],
          ["total_industry", 11],
          ["total_science", 7],
          ["total_strength", 256],
        ],
      ],
    ]);
    const d = diff(Toko0, Toko1);
    const t1 = patch(Toko0, d);
    expect(diff(Toko1, t1)).to.equal(Toko1);
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
    const t0 = patch(Toko0, []);
    expect(diff(Toko0, t0)).to.equal(Toko0);
  });
  it("test real-world patch example", () => {
    const d = diff(turn345, turn346);
    const t346 = patch(turn345, d);
    expect(turn346).to.deep.equal(t346);
    expect(diff(turn346, t346)).to.equal(turn346);
    expect(d).to.deep.equal([
      [
        "scanning_data",
        [
          ["now", 1673302500857],
          [
            "players",
            [
              [
                "6",
                [
                  ["total_economy", 16],
                  ["total_fleets", 6],
                  ["total_industry", 17],
                ],
              ],
              [
                "7",
                [
                  [
                    "tech",
                    [
                      [
                        "manufacturing",
                        [
                          ["level", 2],
                          ["value", 2],
                        ],
                      ],
                      [
                        "terraforming",
                        [
                          ["level", 2],
                          ["value", 2],
                        ],
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ],
          ["tick_fragment", 1.00118722222222],
        ],
      ],
    ]);
  });
});
