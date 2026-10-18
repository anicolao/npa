import { describe, expect, it, vi } from "vitest";
import type { PlayerMap } from "../src/galaxy";

vi.mock("../src/combatcalc", () => ({ annalsOfWar: vi.fn(), combatInfo: {} }));
vi.mock("../src/scans", () => ({ ScanKeyIterator: vi.fn() }));
vi.mock("../src/events", () => ({ isNP4: vi.fn() }));

import { knownFormalAllies } from "../src/alliances";

const players = () =>
  ({
    1: { uid: 1, ai: 0, alias: "Selected", war: { 2: 0 } },
    2: { uid: 2, ai: 0, alias: "Zed", war: { 3: 0 } },
    3: { uid: 3, ai: 0, alias: "Ada" },
    4: { uid: 4, ai: 1, alias: "AI", war: { 1: 0 } },
  }) as unknown as PlayerMap;

describe("formal-alliance colour suggestions", () => {
  it("includes direct allies but not allies-of-allies or AI", () => {
    expect(knownFormalAllies(players(), 1, undefined)).toEqual([2]);
    expect(knownFormalAllies(players(), 4, undefined)).toEqual([]);
  });

  it("uses diplomatic data from either player and sorts names", () => {
    const data = players();
    data[3].war = { 1: 0 };
    expect(knownFormalAllies(data, 1, undefined)).toEqual([3, 2]);
  });

  it("accepts observed alliances including tick zero, but honors current war", () => {
    const data = players();
    const known: number[][] = [];
    known[1] = [];
    known[1][3] = 0;
    expect(knownFormalAllies(data, 1, known)).toEqual([3, 2]);
    data[3].war = { 1: 3 };
    expect(knownFormalAllies(data, 1, known)).toEqual([2]);
    data[2].war = { 1: 1 };
    expect(knownFormalAllies(data, 1, known)).toEqual([]);
  });
});
