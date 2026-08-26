import { expect } from "chai";
import { describe, it, vi } from "vitest";
import {
  apiAccessEnabled,
  historicalReportStartTick,
  playerReference,
  selectAndShowNewFleet,
} from "../src/upstream";

describe("upstream compatibility", () => {
  it("defaults API access to enabled but honors an explicit disable", () => {
    expect(apiAccessEnabled({ config: {} })).to.equal(true);
    expect(apiAccessEnabled({})).to.equal(true);
    expect(apiAccessEnabled({ config: { apiAccess: 1 } })).to.equal(true);
    expect(apiAccessEnabled({ config: { apiAccess: 0 } })).to.equal(false);
  });

  it("uses the current display alias in report references", () => {
    expect(
      playerReference({ alias: "Commander (AFK)", rawAlias: "Commander" }),
    ).to.equal("[[Commander (AFK)]]");
    expect(playerReference(undefined)).to.equal("?");
  });

  it("uses one production cycle for an unfiltered historical report", () => {
    expect(historicalReportStartTick(100, 24, "", ["mine"], {})).to.equal(76);
  });

  it("uses all available personal history for a filtered report", () => {
    expect(
      historicalReportStartTick(100, 24, "enemy", ["mine", "old"], {
        mine: { firstTick: 60 },
        old: { firstTick: 12 },
      }),
    ).to.equal(12);
  });

  it("uses the upstream fleet-selection event and payload shape", () => {
    const trigger = vi.fn();
    const star = { uid: 42 };
    selectAndShowNewFleet({ trigger }, star);
    expect(trigger).toHaveBeenCalledWith("select_and_show_new_fleet", star);
  });
});
