import { expect } from "chai";
import { describe, it } from "vitest";

import { setClip, getClip } from "../src/hotkey";

describe("hotkey tests", () => {
  it("getClip reads lastClip", () => {
    expect(getClip()).to.equal("Error");
  });
});
