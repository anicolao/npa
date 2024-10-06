import { expect } from "chai";
import { describe, it } from "vitest";
import { BspTree, type Point } from "../src/bsp";
import { betaRegulus } from "./scandata";

describe("BSP Tree works as expected", () => {
  const distance = (p0: Point, p1: Point) => {
    const xoff = p0.x - p1.x;
    const yoff = p0.y - p1.y;
    return Math.sqrt(xoff * xoff + yoff * yoff);
  };
  it("can find a star's scannable stars", () => {
    const stars = betaRegulus.scanning_data.stars;
    const t = new BspTree(stars);
    expect(t.size()).to.equal(384);
    const nearby = t.find(stars[3], 0.5);
    expect(nearby.length).to.equal(7);
    const found = {};
    for (const s of nearby) {
      expect(distance(s, stars[3]) <= 0.5).to.equal(true);
      found[s.uid] = s;
    }
    for (const k in stars) {
      if (!found[k]) {
        expect(distance(stars[k], stars[3]) > 0.5).to.equal(true);
      }
    }
  });
  it("gets the same result for many and find", () => {
    const stars = betaRegulus.scanning_data.stars;
    const t = new BspTree(stars);
    expect(t.size()).to.equal(384);
    const nearby1 = t.find(stars[3], 0.5);
    const nearby2 = t.findMany([stars[3]], 0.5);
    expect(nearby1.length).to.equal(nearby2.length);
    for (let i = 0; i < nearby1.length; ++i) {
      expect(nearby1[i]).to.equal(nearby2[i]);
    }
  });
  it("can find a star's scannable stars", () => {
    const stars = betaRegulus.scanning_data.stars;
    const t = new BspTree(stars);
    expect(t.size()).to.equal(384);
    const nearby = t.findMany([stars[3], stars[4]], 0.5);
    expect(nearby.length).to.equal(13);
    const found = {};
    for (const s of nearby) {
      const d1 = distance(s, stars[3]) <= 0.5;
      const d2 = distance(s, stars[4]) <= 0.5;
      expect(d1 || d2).to.equal(true);
      found[s.uid] = s;
    }
    for (const k in stars) {
      if (!found[k]) {
        expect(distance(stars[k], stars[3]) > 0.5).to.equal(true);
      }
    }
  });
});
