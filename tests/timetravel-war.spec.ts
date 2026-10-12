import { expect } from "chai";
import { afterEach, describe, it, vi } from "vitest";
import { alliedFleet, combatInfo } from "../src/combatcalc";
import { messageCache } from "../src/events";
import type { ScanningData } from "../src/galaxy";
import { futureTime } from "../src/timetravel";

vi.mock("../src/intel", () => ({ allSeenKeys: [], getGameNumber: () => 0 }));
vi.mock("../src/firestore", () => ({ firestore: {} }));
vi.mock("../src/logging", () => ({ logCount: vi.fn() }));

describe("future time war transitions", () => {
  afterEach(() => {
    messageCache.game_event = [];
    combatInfo.knownAlliances = undefined;
    vi.unstubAllGlobals();
  });

  it("keeps peace during the warning period, then advances war without mutating the live scan", () => {
    const galaxy = {
      tick: 100,
      tick_rate: 1,
      production_counter: 0,
      production_rate: 100,
      now: 0,
      config: { alliances: 2 }, // NP4: 24-tick warning period
      stars: {},
      fleets: {},
      players: {
        1: { uid: 1, ai: 0, war: { 1: 3, 2: 0 } },
        2: { uid: 2, ai: 0, war: { 1: 0, 2: 3 } },
      },
    } as unknown as ScanningData;
    vi.stubGlobal("NeptunesPride", {
      universe: { galaxy, expandFleetData: vi.fn() },
    });
    messageCache.game_event = [
      {
        payload: {
          template: "war_declared",
          tick: 100,
          attacker: 1,
          defender: 2,
        },
      },
    ];

    const beforeWar = futureTime(galaxy, 23);
    expect(beforeWar.players[1].war[2]).to.equal(0);
    expect(beforeWar.players[2].war[1]).to.equal(0);
    combatInfo.knownAlliances = [];
    expect(alliedFleet(beforeWar.players, 1, 2, 0)).to.equal(true);

    const atWar = futureTime(beforeWar, 1);
    expect(atWar.tick).to.equal(124);
    expect(atWar.players[1].war[2]).to.equal(3);
    expect(atWar.players[2].war[1]).to.equal(3);
    expect(alliedFleet(atWar.players, 1, 2, 0)).to.equal(false);
    expect(galaxy.players[1].war[2]).to.equal(0);
    expect(beforeWar.players[1].war[2]).to.equal(0);
  });

  it("returns to peace on a later accepted peace event", () => {
    const galaxy = {
      tick: 100,
      tick_rate: 1,
      production_counter: 0,
      production_rate: 100,
      now: 0,
      config: { alliances: 1 }, // NP4: one-tick warning period
      stars: {},
      fleets: {},
      players: { 1: { uid: 1, war: { 1: 3, 2: 0 } } },
    } as unknown as ScanningData;
    vi.stubGlobal("NeptunesPride", {
      universe: { galaxy, expandFleetData: vi.fn() },
    });
    messageCache.game_event = [
      {
        payload: {
          template: "war_declared",
          tick: 100,
          attacker: 1,
          defender: 2,
        },
      },
      {
        payload: {
          template: "peace_accepted",
          tick: 103,
          from_puid: 1,
          to_puid: 2,
        },
      },
    ];

    expect(futureTime(galaxy, 1).players[1].war[2]).to.equal(3);
    expect(futureTime(galaxy, 3).players[1].war[2]).to.equal(0);
  });
});
