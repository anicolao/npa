import { expect } from "chai";
import { describe, it } from "vitest";
import { contains, makeReportContent } from "../src/reports";

describe("reports and filtering", () => {
  it("can make a basic report", () => {
    expect(makeReportContent(["hello, world", "on two lines"])).to.equal(
      "hello, world\non two lines",
    );
  });

  it("can make a stanza-ed report", () => {
    expect(makeReportContent([["hello, world"], ["on two lines"]])).to.equal(
      "hello, world\non two lines",
    );
  });

  it("can do a string filter", () => {
    expect(
      makeReportContent(
        [["hello, world"], ["on two lines"]],
        contains("hello"),
      ),
    ).to.equal("hello, world");
  });

  it("accepts an entire stanza if any line passes", () => {
    expect(
      makeReportContent([["hello, world", "on two lines"]], contains("hello")),
    ).to.equal("hello, world\non two lines");
  });
});
