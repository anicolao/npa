import { expect } from "chai";
import { describe, it } from "vitest";
import { Heap } from "../src/heap";

describe("Heap works as expected", () => {
  it("can peek at the minimum value", () => {
    const h = new Heap([9, 12, 2, -1, 5], (a, b) => b - a);
    expect(h.peek()).to.equal(-1);
  });

  it("can peek at the max value", () => {
    const h = new Heap([9, 12, 2, -1, 5], (a, b) => a - b);
    expect(h.peek()).to.equal(12);
  });

  it("can extract values in order", () => {
    const h = new Heap([9, 12, 2, -1, 5], (a, b) => b - a);
    expect(h.size()).to.equal(5);
    expect(h.extract()).to.equal(-1);
    expect(h.size()).to.equal(4);
    expect(h.extract()).to.equal(2);
    expect(h.size()).to.equal(3);
    expect(h.extract()).to.equal(5);
    expect(h.size()).to.equal(2);
    expect(h.extract()).to.equal(9);
    expect(h.size()).to.equal(1);
    expect(h.extract()).to.equal(12);
    expect(h.size()).to.equal(0);
  });
});
