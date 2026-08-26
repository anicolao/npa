import { expect } from "chai";
import { describe, it } from "vitest";
import { resetPlayerDisplayAlias } from "../src/upstream";

describe("time-travel aliases", () => {
  it("resets the display alias without destroying upstream identity fields", () => {
    const player = {
      alias: "Decorated",
      rawAlias: "Commander\u00a0old decoration",
      realAlias: "Account Name",
      ai: 0,
      missedTurns: 0,
    };
    resetPlayerDisplayAlias(player);
    expect(player.alias).to.equal("Commander");
    expect(player.rawAlias).to.equal("Commander\u00a0old decoration");
    expect(player.realAlias).to.equal("Account Name");
  });
});
