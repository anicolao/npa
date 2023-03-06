import { expect } from "chai";
import { describe, it } from "vitest";
import { and, contains, makeReportContent } from "../src/reports";

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

  it("can preprocess case away in a string filter", () => {
    expect(
      makeReportContent(
        [["Hello, world"], ["on two lines"]],
        contains("hello"),
        (s) => s.toLowerCase(),
      ),
    ).to.equal("Hello, world");
  });

  it("accepts an entire stanza if any line passes", () => {
    expect(
      makeReportContent([["hello, world", "on two lines"]], contains("hello")),
    ).to.equal("hello, world\non two lines");
  });

  it("can handle conjunctions", () => {
    expect(
      makeReportContent(
        [["hello, world"], ["hello"], ["world"]],
        and(contains("hello"), contains("world")),
      ),
    ).to.equal("hello, world");
  });
});
